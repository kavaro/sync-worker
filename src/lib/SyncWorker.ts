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
  TWorkerDb,
} from './types'
import { applyChange, applyDelete, applySet } from './util'

export class ClientChanges<TDoc, TPatch> {
  public readonly workerDb: TWorkerDb<any>
  public readonly collection: string

  constructor(workerDb: TWorkerDb<any>, collection: string) {
    this.workerDb = workerDb
    this.collection = collection
  }

  public set(id: string, change: TOptimisticChange<TDoc, TPatch>): void {
    const doc = this.workerDb.setId({ change }, id)
    this.workerDb.set(this.collection, doc)
  }

  public get(id: string): TOptimisticChange<TDoc, TPatch> | void {
    const doc = this.workerDb.get(this.collection, id)
    if (doc) {
      return doc.change
    }
  }

  public values(): Array<TOptimisticChange<TDoc, TPatch>> {
    return this.workerDb.values(this.collection).map(doc => doc.change)
  }

  public async clear(): Promise<void> {
    await this.workerDb.clear(this.collection)
  }
}

export interface TWorkerSyncOptions {
  addListener?: boolean
  changesCollection?: string
}

/**
 * Responsible for conflict resolution between changes to the client database and the server database
 * 
 * - When the client has deleted, then the client delete wins
 * - When the client has upserted, then the fields updated by the client win over those from the server
 * 
 * The worker database must be a synchronous database such as lokijs
 * The server database can be synchronous or asynchronous such as lokijs, firestore or hasura
 */
export default class SyncWorker<TDoc, TPatch> extends EventEmitter {
  private workerDb: TWorkerDb<TDoc>
  private serverDb: TServerDb<TDoc, TPatch>
  private applyPatches: TApplyPatches<TDoc, TPatch>
  private options: TWorkerSyncOptions
  private clientChanges: ClientChanges<any, TPatch>
  private pendingClientChanges: Array<TOptimisticChange<TDoc, TPatch>> | null
  private pendingServerChanges: Array<TWorkerChange<TDoc>> | null

  /**
   * 
   * @param workerDb Worker database
   * @param serverDb Server database
   * @param applyPatches Function that applies the patches of a client upsert to a document
   * @param saveServerChanges Function that saves changes to the server database
   * @param addListener When true the 'changed' event on the server database will call the changed method
   */
  constructor(
    workerDb: TWorkerDb<TDoc>,
    serverDb: TServerDb<TDoc, TPatch>,
    applyPatches: TApplyPatches<TDoc, TPatch>,
    options?: TWorkerSyncOptions 
  ) {
    super()
    this.workerDb = workerDb
    this.serverDb = serverDb
    this.applyPatches = applyPatches
    this.options = { 
      addListener: true,
      changesCollection: '_changes',
      ...options 
    }
    this.clientChanges = new ClientChanges(workerDb, this.options.changesCollection)
    this.pendingClientChanges = null
    this.pendingServerChanges = null
    if (this.options.addListener) {
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
  public clientChanged(optimisticChanges: Array<TOptimisticChange<TDoc, TPatch>>): void {
    if (this.pendingClientChanges) {
      this.pendingClientChanges.push(...optimisticChanges)
      return
    }
    const workerChangesById = new Map<string, TWorkerChange<TDoc>>()
    optimisticChanges.forEach(optimisticChange => {
      const { id, type, collection, doc: clientDoc } = optimisticChange
      const workerDb = this.workerDb
      const docId = workerDb.getId(clientDoc)
      if (type === 'delete') {
        applyDelete(workerDb, collection, docId)
        this.clientChanges.set(docId, { ...optimisticChange })
      } else {
        optimisticChange = optimisticChange as TOptimisticUpsert<TDoc, TPatch>
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
          const { type } = change as TOptimisticDelete<TDoc>
          return { type, collection, doc }
        } else {
          const { type, patches } = change as TOptimisticUpsert<TDoc, TPatch>
          const workerDoc = workerDb.get(change.collection, workerDb.getId(change.doc)) as TDoc
          return { type, collection, doc: workerDb.clean(workerDoc), patches }
        }
      })
      await this.serverDb.save(serverChanges)
      await this.clientChanges.clear()
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
  private changed(serverChanges: Array<TServerChange<TDoc>>): void {
    if (this.pendingServerChanges) {
      this.pendingServerChanges.push(...serverChanges)
      return
    }
    const workerChangesById = new Map<string, TWorkerChange<TDoc>>()
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

  private compact(collection: string, ids: string[]): void {
    const serverIds = new Map<string, boolean>()
    ids.forEach(id => serverIds.set(id, true))
    const changes: Array<TDelete<TDoc>> = this.workerDb
      .ids(collection)
      .filter(id => !serverIds.has(id))
      .map(id => ({ type: 'delete', collection, doc: this.workerDb.clean(this.workerDb.get(collection, id)) }))
    /* istanbul ignore else */
    if (changes.length) {
      this.changed(changes)
    }
  }
}

