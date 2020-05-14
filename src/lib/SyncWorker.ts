import { EventEmitter } from 'events'
import {
  TApplyPatches,
  TOptimisticChange,
  TOptimisticDelete,
  TOptimisticUpsert,
  TServerChange,
  TServerDb,
  TWorkerChange,
  TDelete,
  TWorkerDb
} from './types'
import { applyChange, applyDelete, applySet } from './util'

/**
 * Responsible for conflict resolution between changes to the client database and the server database
 * 
 * - When the client has deleted, then the client delete wins
 * - When the client has upserted, then the fields updated by the client win over those from the server
 * 
 * The worker database must be a synchronous database such as lokijs
 * The server database can be synchronous or asynchronous such as lokijs, firestore or hasura
 */
export default class SyncWorker<TCollection, TDoc, TDocId, TChangeId, TPatch> extends EventEmitter {
  private workerDb: TWorkerDb<TCollection, TDoc, TDocId>
  private serverDb: TServerDb<TCollection, TDoc, TPatch>
  private applyPatches: TApplyPatches<TDoc, TPatch>
  private clientChanges: Map<TDocId, TOptimisticChange<TCollection, TDoc, TChangeId, TPatch>>
  private pendingClientChanges: Array<TOptimisticChange<TCollection, TDoc, TChangeId, TPatch>> | null
  private pendingServerChanges: Array<TWorkerChange<TCollection, TDoc, TChangeId>> | null

  /**
   * 
   * @param workerDb Worker database
   * @param serverDb Server database
   * @param applyPatches Function that applies the patches of a client upsert to a document
   * @param saveServerChanges Function that saves changes to the server database
   * @param addListener When true the 'changed' event on the server database will call the changed method
   */
  constructor(
    workerDb: TWorkerDb<TCollection, TDoc, TDocId>,
    serverDb: TServerDb<TCollection, TDoc, TPatch>,
    applyPatches: TApplyPatches<TDoc, TPatch>,
    addListener: boolean = true
  ) {
    super()
    this.workerDb = workerDb
    this.serverDb = serverDb
    this.applyPatches = applyPatches
    this.clientChanges = new Map()
    this.pendingClientChanges = null
    this.pendingServerChanges = null
    if (addListener) {
      serverDb.addListener('changed', changes => this.changed(changes))
      serverDb.addListener('compact', (collection, ids) => this.compact(collection, ids))
    }
  }

  /**
   * Called by syncClient to notify worker of an (optimistic) change in the client database
   * Stores the client changes to be able to resolve conflicts and to track documents that need to be saved to the 
   * server database. Emits 'changed' event to notify that the client database and the worker database are out of sync.
   * @param optimisticChanges 
   */
  public clientChanged(optimisticChanges: Array<TOptimisticChange<TCollection, TDoc, TChangeId, TPatch>>): void {
    if (this.pendingClientChanges) {
      this.pendingClientChanges.push(...optimisticChanges)
      return
    }
    const workerChangesById = new Map<TDocId, TWorkerChange<TCollection, TDoc, TChangeId>>()
    optimisticChanges.forEach(optimisticChange => {
      const { id, type, collection, doc: clientDoc } = optimisticChange
      const workerDb = this.workerDb
      const docId = workerDb.getId(clientDoc)
      if (type === 'delete') {
        applyDelete(workerDb, collection, docId)
        this.clientChanges.set(docId, { ...optimisticChange })
      } else {
        optimisticChange = optimisticChange as TOptimisticUpsert<TCollection, TDoc, TChangeId, TPatch>
        const oldDoc = workerDb.get(collection, docId)
        if (oldDoc) {
          const newDoc = this.applyPatches(oldDoc, optimisticChange.patches)
          applySet(workerDb, collection, newDoc)
          if (!workerDb.isEqual(newDoc, clientDoc)) {
            workerChangesById.set(docId, { id, type: 'set', collection, doc: newDoc })
          }
        } else {
          applySet(workerDb, collection, clientDoc)
        }
        const oldChange = this.clientChanges.get(docId)
        if (oldChange && oldChange.type === 'upsert') {
          this.clientChanges.set(docId, {
            ...optimisticChange,
            patches: oldChange.patches.concat(optimisticChange.patches)
          })
        } else {
          this.clientChanges.set(docId, { ...optimisticChange })
        }
      }
    })
    const workerChanges = Array.from(workerChangesById.values())
    if (workerChanges.length) {
      this.emit('changed', workerChanges)
    }
  }

  /**
   * Persists the worker database, then saves all changed documents to the server database.
   * Returns a promise that resolves on success or rejects on failure.
   */
  public async save(): Promise<void> {
    const pendingClientChanges = this.pendingClientChanges = []
    const pendingServerChanges = this.pendingServerChanges = []
    try {
      const workerDb = this.workerDb
      await this.workerDb.save()
      const serverChanges = Array.from(this.clientChanges.values()).map(change => {
        const { collection, doc } = change
        if (change.type === 'delete') {
          const { type } = change as TOptimisticDelete<TCollection, TDoc, TChangeId>
          return { type, collection, doc }
        } else {
          const { type, patches } = change as TOptimisticUpsert<TCollection, TDoc, TChangeId, TPatch>
          const workerDoc = workerDb.get(change.collection, workerDb.getId(change.doc)) as TDoc
          return { type, collection, doc: workerDb.clean(workerDoc), patches }
        }
      })
      await this.serverDb.save(serverChanges)
      this.clientChanges = new Map()
    } catch (err) {
      throw err
    } finally {
      this.pendingClientChanges = null
      this.pendingServerChanges = null
      this.clientChanged(pendingClientChanges)
      this.changed(pendingServerChanges)
    }
  }

  /**
   * Called by server database when it has changed.
   * Emits 'changed' event to notify that the client database and the worker database are out of sync.
   * @param serverChanges
   */
  private changed(serverChanges: Array<TServerChange<TCollection, TDoc>>): void {
    if (this.pendingServerChanges) {
      this.pendingServerChanges.push(...serverChanges)
      return
    }
    const workerChangesById = new Map<TDocId, TWorkerChange<TCollection, TDoc, TChangeId>>()
    serverChanges.forEach(serverChange => {
      const { type, collection, doc: serverDoc } = serverChange
      const workerDb = this.workerDb
      const docId = workerDb.getId(serverDoc)
      const clientChange = this.clientChanges.get(docId)
      if (clientChange) {
        if (clientChange.type !== 'delete' && type !== 'delete') {
          const newDoc = this.applyPatches(serverDoc, clientChange.patches)
          applySet(workerDb, collection, newDoc)
          if (!workerDb.isEqual(newDoc, clientChange.doc)) {
            workerChangesById.set(docId, { id: clientChange.id, type, collection, doc: newDoc })
          }
        }
      } else if (applyChange(workerDb, type, collection, serverDoc)) {
        workerChangesById.set(docId, { type, collection, doc: serverDoc })
      }
    })
    const workerChanges = Array.from(workerChangesById.values())
    if (workerChanges.length) {
      this.emit('changed', workerChanges)
    }
  }

  private compact(collection: TCollection, ids: TDocId[]): void {
    const serverIds = new Map<TDocId, boolean>()
    ids.forEach(id => serverIds.set(id, true))
    const changes: Array<TDelete<TCollection, TDoc>> = this.workerDb
      .ids(collection)
      .filter(id => !serverIds.has(id))
      .map(id => ({ type: 'delete', collection, doc: this.workerDb.clean(this.workerDb.get(collection, id)) }))
    /* istanbul ignore else */
    if (changes.length) {
      this.changed(changes)
    }
  }
}

