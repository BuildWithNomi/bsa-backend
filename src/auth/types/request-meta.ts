/** Client fingerprint stored alongside a refresh token for audit purposes only. */
export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}
