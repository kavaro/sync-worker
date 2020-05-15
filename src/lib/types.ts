export interface TObj {
  [key: string]: any
}

export type TIdFactory = () => string

export type UPSERT = 'upsert'
export type SET = 'set'
export type DELETE = 'delete'

export type TApplyPatches<TDoc, TPatch> = (doc: TDoc, patches: TPatch[]) => TDoc

export interface TCollectionDoc<TDoc> {
  collection: string
  doc: TDoc
}

export interface TDelete<TDoc> extends TCollectionDoc<TDoc> {
  type: DELETE
}

export interface TOptimisticDelete<TDoc> extends TDelete<TDoc> {
  id: string
}

export interface TWorkerDelete<TDoc> extends TDelete<TDoc> {
  id?: string
}

export interface TUpsert<TDoc, TPatch> extends TCollectionDoc<TDoc> {
  type: UPSERT
  patches: TPatch[]
}

export interface TOptimisticUpsert<TDoc, TPatch> extends TUpsert<TDoc, TPatch> {
  id: string
}

export interface TSet<TDoc> extends TCollectionDoc<TDoc> {
  type: SET
}

export interface TWorkerSet<TDoc> extends TSet<TDoc> {
  id?: string
}

export type TDbChange<TDoc, TPatch> =
  TUpsert<TDoc, TPatch> |
  TDelete<TDoc>

export type TOptimisticChange<TDoc, TPatch> =
  TOptimisticUpsert<TDoc, TPatch> |
  TOptimisticDelete<TDoc>

export type TWorkerChange<TDoc> =
  TWorkerSet<TDoc> |
  TWorkerDelete<TDoc>

export type TServerChange<TDoc> =
  TSet<TDoc> |
  TDelete<TDoc>

export type TDbChangeType = SET | DELETE

export interface TDbBase<TDoc> {
  /**
   * Given collection name and document id return document
   * @param collection Collection name
   * @param id Document id
   */
  get(collection: string, id: string): TDoc | void
  /**
   * Given collection name set document by its id
   * If document does not have id, then a id should be generated and assign to the id property
   * @param collection Collection name
   * @param doc Document
   * @returns Document or undefined 
   */
  set(collection: string, doc: TDoc): void
  /**
   * Delete document by collection name  document
   * @param collection Collection name
   * @param id Document id
   * @returns Deleted document
   */
  delete(collection: string, id: string): void
  /**
   * Give document return its id
   * @param doc 
   * @returns document id
   */
  getId(doc: TDoc): string
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
export interface TWorkerDb<TDoc> extends TDbBase<TDoc> {
  /**
   * Set id on document
   * @param doc 
   * @param id
   * @returns document
   */
  setId(doc: TDoc, id: string): TDoc
  /**
   * Remove all database artifacts from doc
   * @param doc 
   */
  clean(doc: any): TDoc
  /**
   * Clear all docs from collection
   * @param collection
   */
  clear(collection: string): Promise<void> 
  /**
   * Get a list of all ids in collection
   * @returns array with all ids in the collection
   */
  ids(collection: string): string[]
  /**
   * Get a list of all docs in collection
   * @param collection
   */ 
  values(collection: string): TDoc[]
  /**
   * Persist database and return a promise that resolves on success and rejects on failure
   */
  save(): Promise<void>
}

export type Listener = (...args: any[]) => void

/**
 * Client database interface
 */
export interface TClientDb<TDoc> extends TDbBase<TDoc> {
  /**
   * Remove all database artifacts from doc
   * @param doc 
   */
  clean(doc: any): TDoc
  /**
   * Add event listener
   * @param event
   * @param fn 
   */
  addListener(event: string, fn: Listener): void
}

/**
 * Server database interface
 */
export interface TServerDb<TDoc, TPatch> {
  /**
   * Add event listener
   * @param event
   * @param fn 
   */
  addListener(event: string, fn: Listener): void
  /**
   * Save changes to server database
   * @param changes 
   */
  save(changes: Array<TDbChange<TDoc, TPatch>>) : Promise<void>
}
