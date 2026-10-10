import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '../../../common/errors';
import type { ToolDefinition } from '../../language-models';
import { SELLER_CONTENT_NOTICE } from '../seller-text';
import { AssistantTool, ToolContext, ToolResult } from './assistant-tool';
import { FindSimilarArtworksTool } from './find-similar-artworks.tool';
import { GetAuctionDetailsTool } from './get-auction-details.tool';
import { GetMyActivityTool } from './get-my-activity.tool';
import { SearchArtworksTool } from './search-artworks.tool';

export interface ExecutedTool {
  /** JSON handed back to the model. */
  readonly content: string;
  readonly auctionSlugs: readonly string[];
  readonly isSuccessful: boolean;
}

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly toolsByName: ReadonlyMap<string, AssistantTool>;
  readonly definitions: readonly ToolDefinition[];

  constructor(
    searchArtworks: SearchArtworksTool,
    getAuctionDetails: GetAuctionDetailsTool,
    findSimilarArtworks: FindSimilarArtworksTool,
    getMyActivity: GetMyActivityTool,
  ) {
    const tools = [searchArtworks, getAuctionDetails, findSimilarArtworks, getMyActivity] as AssistantTool[];
    this.toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    this.definitions = tools.map((tool) => {
      const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.argumentsSchema, { io: 'input' });
      return { name: tool.name, description: tool.description, parameters };
    });
  }

  /** Errors go back to the model as data, so it can correct itself; they never end the turn. */
  async execute(name: string, rawArguments: string, context: ToolContext): Promise<ExecutedTool> {
    const tool = this.toolsByName.get(name);
    if (!tool) return failure(`Unknown tool "${name}"`);

    let json: unknown;
    try {
      json = rawArguments.trim() ? JSON.parse(rawArguments) : {};
    } catch {
      return failure('Arguments were not valid JSON');
    }
    const parsedArguments = tool.argumentsSchema.safeParse(json);
    if (!parsedArguments.success) {
      return failure('Invalid arguments', { issues: z.flattenError(parsedArguments.error).fieldErrors });
    }

    let result: ToolResult<unknown>;
    try {
      result = await tool.run(parsedArguments.data, context);
    } catch (error) {
      if (error instanceof DomainError && error.httpStatus < 500) return failure(error.message);
      throw error;
    }

    // Fails closed: an output with any field the schema does not list is never sent to the model.
    const parsedOutput = tool.outputSchema.safeParse(result.output);
    if (!parsedOutput.success) {
      this.logger.error(`Tool ${name} produced output outside its schema: ${parsedOutput.error.message}`);
      return failure('The tool could not produce a result.');
    }
    return {
      content: JSON.stringify({ notice: SELLER_CONTENT_NOTICE, ...(parsedOutput.data as object) }),
      auctionSlugs: result.auctionSlugs,
      isSuccessful: true,
    };
  }
}

function failure(error: string, extra: Record<string, unknown> = {}): ExecutedTool {
  return { content: JSON.stringify({ error, ...extra }), auctionSlugs: [], isSuccessful: false };
}

export const ASSISTANT_TOOLS = [SearchArtworksTool, GetAuctionDetailsTool, FindSimilarArtworksTool, GetMyActivityTool];
