import { IGroupRepository } from '@waha/core/engines/noweb/store/IGroupRepository';
import { ILabelAssociationRepository } from '@waha/core/engines/noweb/store/ILabelAssociationsRepository';
import { ILabelsRepository } from '@waha/core/engines/noweb/store/ILabelsRepository';

import { IChatRepository } from './IChatRepository';
import { IContactRepository } from './IContactRepository';
import { IMessagesRepository } from './IMessagesRepository';

export abstract class INowebStorage {
  abstract init(): Promise<void>;

  abstract close(): Promise<void>;

  abstract getContactsRepository(): IContactRepository;

  abstract getChatRepository(): IChatRepository;

  abstract getGroupRepository(): IGroupRepository;

  abstract getMessagesRepository(): IMessagesRepository;

  abstract getLabelsRepository(): ILabelsRepository;

  abstract getLabelAssociationRepository(): ILabelAssociationRepository;
}
