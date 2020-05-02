import { EventEmitter } from 'events'
import OptimisticChangeIds from './OptimisticChangeIds'
import {
  TClientDb,
  TDbChange,
  TIdFactory,
  TWorkerChange
} from './types'
import { applyChange } from './util'

/**
 * Responsible to forward client database changes to worker and apply worker database changes to 
 * client database. Changes from the worker database are applied to the client database provided there is no
 * pending optimistic change in progress.
 * The client database must be a synchronous database such as lokijs
 */
export default class SyncClient<TCollection, TDoc, TDocId, TChangeId, TPatch> extends EventEmitter {
  private clientDb: TClientDb<TCollection, TDoc, TDocId>
  private optimisticChangeIds: OptimisticChangeIds<TDocId, TChangeId>
  private applyingWorkerChanges: boolean

  /**
   * 
   * @param clientDb Client database
   * @param changeIdFactory Function that returns optimistic change id
   * @param addListener When true a 'changed' listener on client database will be added that calls the changed method
   */
  constructor(clientDb: TClientDb<TCollection, TDoc, TDocId>, changeIdFactory: TIdFactory<TChangeId>, addListener: boolean = true) {
    super()
    this.clientDb = clientDb
    this.optimisticChangeIds = new OptimisticChangeIds(changeIdFactory)
    this.applyingWorkerChanges = false
    if (addListener) {
      clientDb.addListener('changed', changes => this.changed(changes))
    }
  }

  /**
   * Called by worker when its database is not in sync with the client database.
   * The worker changes is applied to the client database unless is a pending optimistic change for the same doc
   * @param changes 
   */
  public workerChanged(changes: Array<TWorkerChange<TCollection, TDoc, TChangeId>>): void {
    const clientDb = this.clientDb
    this.applyingWorkerChanges = true
    changes.forEach(change => {
      const { collection, doc } = change
      const id = clientDb.getId(doc)
      if (this.optimisticChangeIds.remove(id, change.id)) {
        applyChange(clientDb, change.type, collection, doc)
      }
    })
    this.applyingWorkerChanges = false
  }

  /**
   * Must be called when client database has changed
   * Assigns a unique id to an optimistic change and forwards the change to the worker
   * @param changes 
   */
  private changed(changes: Array<TDbChange<TCollection, TDoc, TPatch>>): void {
    if (!this.applyingWorkerChanges) {
      const clientDb = this.clientDb
      const clientChanges = changes.map(change => ({
        id: this.optimisticChangeIds.add(clientDb.getId(change.doc)),
        ...change
      }))
      this.emit('changed', clientChanges)
    }
  }
}
