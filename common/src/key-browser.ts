export interface KeyPageRequest {
  connectionId: string;
  pattern?: string;
  keyType?: string;
  count?: number;
  cursor?: string;
  requestId?: string;
}

export const KEY_PAGE_SIZE = 200
