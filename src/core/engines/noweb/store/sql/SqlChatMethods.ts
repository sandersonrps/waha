import { Chat } from '@adiwajshing/baileys';
import { SqlKVRepository } from '@waha/core/storage/sql/SqlKVRepository';
import { PaginationParams } from '@waha/structures/pagination.dto';

export class SqlChatMethods {
  constructor(private repository: SqlKVRepository<any>) {}

  async getAllWithMessages(
    pagination: PaginationParams,
    broadcast: boolean,
  ): Promise<Chat[]> {
    // Get chats with conversationTimestamp is not Null
    let query = this.repository.select().whereNotNull('conversationTimestamp');
    if (!broadcast) {
      // filter out chat by id if it ends at @newsletter or @broadcast
      query = query
        .andWhereNot('id', 'like', '%@broadcast')
        .andWhereNot('id', 'like', '%@newsletter');
    }
    query = this.repository.pagination(query, pagination);
    return await this.repository.all(query);
  }
}
