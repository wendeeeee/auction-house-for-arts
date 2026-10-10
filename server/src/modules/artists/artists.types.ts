export interface Artist {
  readonly id: string;
  /** The artist's own user account: owning an artwork as this user means a primary sale. */
  readonly userId: string;
  readonly slug: string;
  readonly name: string;
  readonly bio: string;
  /** Resale royalty, 0–2,000 basis points (0–20%). */
  readonly royaltyBps: number;
  readonly createdAt: Date;
}
