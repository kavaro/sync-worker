import { EventEmitter } from 'events'
import {
  TWorkerDb,
  TServerDb,
  TOptimisticChange,
  TWorkerChange,
  TServerChange,
  TOptimisticDelete,
  TOptimisticUpsert,
  TApplyPatches
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
  workerDb: TWorkerDb<TCollection, TDoc, TDocId>
  serverDb: TServerDb<TCollection, TDoc, TPatch>
  applyPatches: TApplyPatches<TDoc, TPatch>
  clientChanges: Map<TDocId, TOptimisticChange<TCollection, TDoc, TChangeId, TPatch>>
  pendingClientChanges: Array<TOptimisticChange<TCollection, TDoc, TChangeId, TPatch>> | null
  pendingServerChanges: Array<TWorkerChange<TCollection, TDoc, TChangeId>> | null

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
    }
  }

  /**
   * Called by syncClient to notify worker of an (optimistic) change in the client database
   * Stores the client changes to be able to resolve conflicts and to track documents that need to be saved to the 
   * server database. Emits 'changed' event to notify that the client database and the worker database are out of sync.
   * @param optimisticChanges 
   */
  clientChanged(optimisticChanges: Array<TOptimisticChange<TCollection, TDoc, TChangeId, TPatch>>): void {
    if (this.pendingClientChanges) {
      this.pendingClientChanges.push(...optimisticChanges)
      return
    }
    const workerChangesById = new Map<TDocId, TWorkerChange<TCollection, TDoc, TChangeId>>()
    optimisticChanges.forEach(optimisticChange => {
      const { id, type, collection, doc: clientDoc } = optimisticChange
      const { workerDb: db } = this
      const docId = db.getId(clientDoc)
      if (type === 'delete') {
        applyDelete(db, collection, docId)
        this.clientChanges.set(docId, { ...optimisticChange })
      } else {
        optimisticChange = optimisticChange as TOptimisticUpsert<TCollection, TDoc, TChangeId, TPatch>
        const oldDoc = db.get(collection, docId)
        if (oldDoc) {
          const newDoc = this.applyPatches(oldDoc, optimisticChange.patches)
          applySet(db, collection, newDoc)
          if (!db.isEqual(newDoc, clientDoc)) {
            workerChangesById.set(docId, { id, type: 'set', collection, doc: newDoc })
          }
        } else {
          applySet(db, collection, clientDoc)
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
   * Called by server database when it has changed.
   * Emits 'changed' event to notify that the client database and the worker database are out of sync.
   * @param serverChanges
   */
  changed(serverChanges: Array<TServerChange<TCollection, TDoc>>): void {
    if (this.pendingServerChanges) {
      this.pendingServerChanges.push(...serverChanges)
      return
    }
    const workerChangesById = new Map<TDocId, TWorkerChange<TCollection, TDoc, TChangeId>>()
    serverChanges.forEach(serverChange => {
      const { type, collection, doc: serverDoc } = serverChange
      const { workerDb: db } = this
      const docId = db.getId(serverDoc)
      const clientChange = this.clientChanges.get(docId)
      if (clientChange) {
        if (clientChange.type !== 'delete') {
          if (type === 'delete') {
            const deletedDoc = applyDelete(db, collection, docId)
            if (deletedDoc) {
              workerChangesById.set(docId, { id: clientChange.id, type, collection, doc: deletedDoc })
            }
          } else {
            const newDoc = this.applyPatches(serverDoc, clientChange.patches)
            applySet(db, collection, newDoc)
            if (!db.isEqual(newDoc, clientChange.doc)) {
              workerChangesById.set(docId, { id: clientChange.id, type, collection, doc: newDoc })
            }
          }
        }
      } else if (applyChange(db, type, collection, serverDoc)) {
        workerChangesById.set(docId, { type, collection, doc: serverDoc })
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
  async save() {
    const pendingClientChanges = this.pendingClientChanges = []
    const pendingServerChanges = this.pendingServerChanges = []
    try {
      const { workerDb: db } = this
      await this.workerDb.save()
      const serverChanges = Array.from(this.clientChanges.values()).map(change => {
        const { collection, doc } = change
        if (change.type === 'delete') {
          const { type } = change as TOptimisticDelete<TCollection, TDoc, TChangeId>
          return { type, collection, doc }
        } else {
          const { type, patches } = change as TOptimisticUpsert<TCollection, TDoc, TChangeId, TPatch>
          const doc = db.get(change.collection, db.getId(change.doc)) as TDoc
          return { type, collection, doc, patches }
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
}

