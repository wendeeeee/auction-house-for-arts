import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { ExtendedError, Server, Socket } from 'socket.io';
import { ErrorCode } from '../../common/errors';
import { IDENTITY_LOOKUP, IdentityLookup, parseDemoUserIdClaim } from '../../common/identity';
import { watchAuctionMessageSchema } from './dto/watch-auction.dto';
import {
  RealtimeAcknowledgement,
  RealtimeSocketData,
  UNWATCH_AUCTION_MESSAGE,
  WATCH_AUCTION_MESSAGE,
  auctionRoom,
  userRoom,
} from './realtime.types';

/**
 * A socket has its own user room plus at most this many auction rooms. A page watches one
 * auction at a time; the cap stops a single connection from subscribing to every auction.
 */
export const MAXIMUM_WATCHED_AUCTIONS_PER_CONNECTION = 20;

@WebSocketGateway({ transports: ['websocket'] })
export class AuctionEventsGateway implements OnGatewayInit<Server>, OnGatewayConnection<Socket> {
  private readonly logger = new Logger(AuctionEventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(@Inject(IDENTITY_LOOKUP) private readonly identityLookup: IdentityLookup) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.authenticateHandshake(socket).then(
        () => next(),
        (error: unknown) => next(this.toHandshakeError(error)),
      );
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const { userId } = socketData(socket);
    if (userId) await socket.join(userRoom(userId));
  }

  @SubscribeMessage(WATCH_AUCTION_MESSAGE)
  async watchAuction(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<RealtimeAcknowledgement> {
    const parsed = watchAuctionMessageSchema.safeParse(body);
    if (!parsed.success) return rejectInvalidMessage();

    const room = auctionRoom(parsed.data.slug);
    if (!socket.rooms.has(room) && countAuctionRooms(socket) >= MAXIMUM_WATCHED_AUCTIONS_PER_CONNECTION) {
      return {
        ok: false,
        error: {
          code: ErrorCode.REQUEST_REJECTED,
          message: `A connection can watch at most ${MAXIMUM_WATCHED_AUCTIONS_PER_CONNECTION} auctions.`,
        },
      };
    }
    
    await socket.join(room);
    return { ok: true };
  }

  @SubscribeMessage(UNWATCH_AUCTION_MESSAGE)
  async unwatchAuction(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<RealtimeAcknowledgement> {
    const parsed = watchAuctionMessageSchema.safeParse(body);
    if (!parsed.success) return rejectInvalidMessage();
    await socket.leave(auctionRoom(parsed.data.slug));
    return { ok: true };
  }

  private async authenticateHandshake(socket: Socket): Promise<void> {
    const auth: unknown = socket.handshake.auth;
    const claimedValue = typeof auth === 'object' && auth !== null ? (auth as Record<string, unknown>).demoUserId : undefined;
    const claim = parseDemoUserIdClaim(claimedValue);
    if (claim.kind === 'anonymous') return;
    if (claim.kind === 'malformed') throw new UnknownDemoUserError();

    const user = await this.identityLookup.findById(claim.userId);
    if (!user) throw new UnknownDemoUserError();
    socketData(socket).userId = user.id;
  }

  /**
   * The client receives `connect_error` with `message` and `data`. `data` carries the same
   * `{ code, message }` shape as the HTTP error contract, so the web app reads both alike.
   */
  private toHandshakeError(error: unknown): ExtendedError {
    if (error instanceof UnknownDemoUserError) {
      return Object.assign(new Error(error.message), {
        data: { code: ErrorCode.UNAUTHENTICATED, message: error.message },
      });
    }
  
    this.logger.error(`Socket handshake failed: ${error instanceof Error ? error.message : String(error)}`);
    const message = 'The server could not check this connection.';
    return Object.assign(new Error(message), { data: { code: ErrorCode.INTERNAL_ERROR, message } });
  }
}

/**socket.IO `connect_error`ttp filter is not reached. */
class UnknownDemoUserError extends Error {
  constructor() {
    super('demoUserId is not a known demo user.');
    this.name = 'UnknownDemoUserError';
  }
}

function rejectInvalidMessage(): RealtimeAcknowledgement {
  return { ok: false, error: { code: ErrorCode.VALIDATION_FAILED, message: 'Expected { slug } with an auction slug.' } };
}


function socketData(socket: Socket): RealtimeSocketData {
  return socket.data as RealtimeSocketData;
}

function countAuctionRooms(socket: Socket): number {
  return [...socket.rooms].filter((room) => room.startsWith(auctionRoom(''))).length;
}
