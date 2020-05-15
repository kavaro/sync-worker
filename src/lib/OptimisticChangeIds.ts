import { TIdFactory } from './types'

/**
 * Responsible to track the id's of optimistic changes
 */
export default class OptimisticChangeIds {
  private idFactory: TIdFactory
  private ids: Map<string, string>

  /**
   * 
   * @param idFactory Function that returns an id for the optimistic changes
   */
  constructor(idFactory: TIdFactory) {
    this.idFactory = idFactory
    this.ids = new Map()
  }

  /**
   * Assign id to the optimistic change and store the it in the this.ids[docId] map
   * @param docId
   * @returns changeId
   */
  public add(docId: string): string {
    const changeId = this.idFactory()
    this.ids.set(docId, changeId)
    return changeId
  }

  /**
   * Removes change id from this.ids[docId] when change.id matches changeId 
   * @param docId 
   * @param changeId 
   * @returns true when change id has been removed or did not exist
   */
  public remove(docId: string, changeId?: string): boolean {
    const ids = this.ids
    if (!ids.has(docId)) {
      return true
    }
    if (changeId === ids.get(docId)) {
      ids.delete(docId)
      return true
    }
    return false
  }
}

