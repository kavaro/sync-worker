import { EventEmitter } from 'events'
import { produceWithPatches, enablePatches, Patch } from 'immer'
import stringify from 'json-stable-stringify'
import { v4 as uuid } from 'uuid'
import { applyChange } from './util'
import { TClientDb, TWorkerDb, TServerDb, TDbChange, TDbChangeType } from './types'

enablePatches()

function createMapId(collection, docId) {
  return `${collection}/${docId}`
}

/**
 * In memory synchronous store implementation.
 * Used to test sync-worker module, but can be used as an in-memory store.
 */
export class MemoryDbBase<TDoc> extends EventEmitter implements TClientDb<string, TDoc, string> {
  /**
   * True when database shall emit events
   */
  emits: boolean
  /**
   * Maps collectionName/docId to doc
   */
  docs: Map<string, TDoc>

  /**
   * Create a simple in-memory synchronous database
   * @param type The type of database determines the capabilities as required by sync-worker
   */
  constructor(emits: boolean) {
    super()
    this.emits = emits
    this.docs = new Map()
  }

  /**
   * Given a collection name and id return a document, if document does not exist return undefined
   * @param collection Name of the collection
   * @param id Document id
   */
  get(collection: string, id: string): TDoc {
    return this.docs.get(createMapId(collection, id))
  }

  /**
   * Set document by id
   * If set changes the document then it emit a 'changed' event { type: 'upsert', collection, doc, patches: [patch] }
   * Setting the same document twice will not generate a 'changed' event
   * When the document does not exists, then patches are generated for all doc properties
   * Returns the document that has been set
   * If document does not contain an id field then one is generated before inserting the document
   * @param collection Name of the collection
   * @param doc Document to be set
   */
  set(collection: string, doc: TDoc): TDoc {
    const oldDoc = this.get(collection, this.getId(doc as TDoc & { id: string }))
    const [producedDoc, patches] = produceWithPatches(oldDoc || {}, (draft: TDoc & { id: string }) => { 
      if (!('id' in draft)) {
        draft.id = uuid()
      }
      Object.assign(draft, doc) 
    })
    const newDoc = producedDoc as TDoc & { id: string }
    this.docs.set(createMapId(collection, newDoc.id), newDoc)
    if (this.emits && !oldDoc || !this.isEqual(newDoc, oldDoc)) {
      this.emit('changed', [{ type: 'upsert', collection, doc: newDoc, patches }])
    }
    return newDoc
  }

  /**
   * Deletes a document by id
   * If the document has been deleted then a 'changed' event is emitted { type: 'delete', collection, doc }
   * @param collection Name of the collection
   * @param id Id of document to delete
   */
  delete(collection: string, id: string): TDoc {
    const oldDoc = this.get(collection, id)
    this.docs.delete(createMapId(collection, id))
    if (this.emits && oldDoc) {
      this.emit('changed', [{ type: 'delete', collection, doc: oldDoc }])
    }
    return oldDoc
  }

  /**
   * Given a doc, return its id
   * @param doc Document with id field
   */
  getId(doc: TDoc & { id: string }): string {
    return doc.id
  }

  /**
   * Returns true when 2 docs are the same
   * @param docA 
   * @param docB 
   */
  isEqual(docA: TDoc, docB: TDoc): boolean {
    return stringify(docA) === stringify(docB)
  }
}

/**
 * Client synchronous in-memory database implementation
 */
export class ClientMemoryDb<TDoc> extends MemoryDbBase<TDoc> implements TClientDb<string, TDoc, string> {
  constructor() {
    super(true)
  }
}

/**
 * Worker synchronous in-memory database implementation
 */
export class WorkerMemoryDb<TDoc> extends MemoryDbBase<TDoc> implements TWorkerDb<string, TDoc, string> {
  constructor() {
    super(false)
  }

  /**
   * Persists database changes
   * Returns promise that resolves when save was successfull and rejects otherwise
   */
  async save(): Promise<void> {
  }
}

/**
 * Server synchronous in-memory database implementation
 */
export class ServerMemoryDb<TDoc> extends MemoryDbBase<TDoc> implements TServerDb<string, TDoc, Patch> {
  constructor() {
    super(true)
  }

  /**
   * Mutates server database with changes
   * Returns promise that resolves when save was successfull and rejects otherwise
   * @param changes 
   */
  async save(changes: Array<TDbChange<string, TDoc, Patch>>) : Promise<void> {
    changes.forEach(change => applyChange(this, change.type as TDbChangeType, change.collection, change.doc))
  }
}
