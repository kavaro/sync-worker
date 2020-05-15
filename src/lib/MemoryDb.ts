import { EventEmitter } from 'events'
import { produceWithPatches, enablePatches, Patch } from 'immer'
import stringify from 'json-stable-stringify'
import { v4 as uuid } from 'uuid'
import { applyChange } from './util'
import { TDbBase, TClientDb, TWorkerDb, TServerDb, TDbChange, TDbChangeType } from './types'

enablePatches()

function createMapId(collection: string, docId: string): string {
  return `${collection}/${docId}`
}

/**
 * In memory synchronous store implementation.
 * Used to test sync-worker module, but can be used as an in-memory store.
 */
export class MemoryDbBase<TDoc> extends EventEmitter implements TDbBase<TDoc> {
  /**
   * Maps collectionName/docId to doc
   */
  protected docs: Map<string, TDoc>
  /**
   * True when database shall emit events
   */
  private emits: boolean

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
  public get(collection: string, id: string): TDoc {
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
  public set(collection: string, doc: TDoc): TDoc {
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
  public delete(collection: string, id: string): TDoc {
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
  public getId(doc: TDoc & { id: string }): string {
    return doc.id
  }

  /**
   * Returns true when 2 docs are the same
   * @param docA 
   * @param docB 
   */
  public isEqual(docA: TDoc, docB: TDoc): boolean {
    return stringify(docA) === stringify(docB)
  }
}

/**
 * Client synchronous in-memory database implementation
 */
export class ClientMemoryDb<TDoc> extends MemoryDbBase<TDoc> implements TClientDb<TDoc> {
  constructor() {
    super(true)
  }

  /**
   * Remove all database related fields from doc
   * @param doc 
   */
  public clean(doc: any): TDoc {
    return doc
  }
}

/**
 * Worker synchronous in-memory database implementation
 */
export class WorkerMemoryDb<TDoc> extends MemoryDbBase<TDoc> implements TWorkerDb<TDoc> {
  constructor() {
    super(false)
  }

  public setId(doc: TDoc, id: string): TDoc {
    (doc as any).id = id
    return doc
  }

  /**
   * Remove all database related fields from doc
   * @param doc 
   */
  public clean(doc: TDoc): TDoc {
    return doc
  }


  /**
   * Returns array with all ids in collection
   * @param collection 
   */
  public ids(collection: string): string[] {
    return Array.from(this.docs.keys())
      .map(id => id.split('/'))
      .filter(arr => arr[0] === collection)
      .map(arr => arr[1])
  }

  /**
   * Returns array with all docs in collection
   * @param collection 
   * @param collection 
   */
  public values(collection: string): TDoc[] {
    return this.ids(collection).map(id => this.get(collection, id))
  }

  /**
   * Remove all docs from collection and save collection
   * @param collection
   */
  public async clear(collection: string): Promise<void> {
    this.ids(collection).forEach(id => this.delete(collection, id))
  }

  /**
   * Persists database changes
   * Returns promise that resolves when save was successfull and rejects otherwise
   */
  public async save(): Promise<void> {
  }
}

/**
 * Server synchronous in-memory database implementation
 */
export class ServerMemoryDb<TDoc> extends MemoryDbBase<TDoc> implements TServerDb<TDoc, Patch> {
  constructor() {
    super(true)
  }

  /**
   * Mutates server database with changes
   * Returns promise that resolves when save was successfull and rejects otherwise
   * @param changes 
   */
  public async save(changes: Array<TDbChange<TDoc, Patch>>): Promise<void> {
    changes.forEach(change => applyChange(this, change.type as TDbChangeType, change.collection, change.doc))
  }
}
