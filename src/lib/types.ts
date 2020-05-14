export interface TObj {
  [key: string]: any
}

export type TIdFactory<TId> = () => TId

export type UPSERT = 'upsert'
export type SET = 'set'
export type DELETE = 'delete'

export type TApplyPatches<TDoc, TPatch> = (doc: TDoc, patches: TPatch[]) => TDoc

export interface TCollectionDoc<TCollection, TDoc> {
  collection: TCollection
  doc: TDoc
}

export interface TDelete<TCollection, TDoc> extends TCollectionDoc<TCollection, TDoc> {
  type: DELETE
}

export interface TOptimisticDelete<TCollection, TDoc, TChangeId> extends TDelete<TCollection, TDoc> {
  id: TChangeId
}

export interface TWorkerDelete<TCollection, TDoc, TChangeId> extends TDelete<TCollection, TDoc> {
  id?: TChangeId
}

export interface TUpsert<TCollection, TDoc, TPatch> extends TCollectionDoc<TCollection, TDoc> {
  type: UPSERT
  patches: TPatch[]
}

export interface TOptimisticUpsert<TCollection, TDoc, TChangeId, TPatch> extends TUpsert<TCollection, TDoc, TPatch> {
  id: TChangeId
}

export interface TSet<TCollection, TDoc> extends TCollectionDoc<TCollection, TDoc> {
  type: SET
}

export interface TWorkerSet<TCollection, TDoc, TChangeId> extends TSet<TCollection, TDoc> {
  id?: TChangeId
}

export type TDbChange<TCollection, TDoc, TPatch> =
  TUpsert<TCollection, TDoc, TPatch> |
  TDelete<TCollection, TDoc>

export type TOptimisticChange<TCollection, TDoc, TChangeId, TPatch> =
  TOptimisticUpsert<TCollection, TDoc, TChangeId, TPatch> |
  TOptimisticDelete<TCollection, TDoc, TChangeId>

export type TWorkerChange<TCollection, TDoc, TChangeId> =
  TWorkerSet<TCollection, TDoc, TChangeId> |
  TWorkerDelete<TCollection, TDoc, TChangeId>

export type TServerChange<TCollection, TDoc> =
  TSet<TCollection, TDoc> |
  TDelete<TCollection, TDoc>

export type TDbChangeType = SET | DELETE

export interface TDbBase<TCollection, TDoc, TId> {
  /**
   * Given collection name and document id return document
   * @param collection Collection name
   * @param id Document id
   */
  get(collection: TCollection, id: TId): TDoc | void
  /**
   * Given collection name set document by its id
   * If document does not have id, then a id should be generated and assign to the id property
   * @param collection Collection name
   * @param doc Document
   * @returns Document or undefined 
   */
  set(collection: TCollection, doc: TDoc): void
  /**
   * Delete document by collection name  document
   * @param collection Collection name
   * @param id Document id
   * @returns Deleted document
   */
  delete(collection: TCollection, id: TId): void
  /**
   * Remove all database artifacts from doc
   * @param doc 
   */
  clean(doc: any): TDoc
  /**
   * Give document return its id
   * @param doc 
   * @returns document id
   */
  getId(doc: TDoc): TId
  /**
   * Returns true when 2 document are the same
   * @param docA 
   * @param docB 
   * @returns true when both documents are the same
   */
  isEqual(docA: TDoc, docB: TDoc): boolean
}

/**
 * Worker database interface
 */
export interface TWorkerDb<TCollection, TDoc, TId> extends TDbBase<TCollection, TDoc, TId> {
  /**
   * Persist database and return a promise that resolves on success and rejects on failure
   */
  save(): Promise<void>
}

export type Listener = (...args: any[]) => void

/**
 * Client database interface
 */
export interface TClientDb<TCollection, TDoc, TId> extends TDbBase<TCollection, TDoc, TId> {
  addListener(event: string, fn: Listener): void
}

/**
 * Server database interface
 */
export interface TServerDb<TCollection, TDoc, TPatch> {
  addListener(event: string, fn: Listener): void
  save(changes: Array<TDbChange<TCollection, TDoc, TPatch>>) : Promise<void>
}
