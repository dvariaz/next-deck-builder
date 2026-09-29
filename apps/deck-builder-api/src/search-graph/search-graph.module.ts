import { Module } from '@nestjs/common';
import { CardAliasService } from './card-alias.service';
import { CardEffectsService } from './card-effects.service';
import { EffectVocabularyService } from './effect-vocabulary.service';
import { SearchGraphController } from './search-graph.controller';
import { SearchGraphService } from './search-graph.service';
import { SearchResolverService } from './search-resolver.service';

/** PrismaModule is @Global, so this module needs no imports. */
@Module({
  controllers: [SearchGraphController],
  providers: [
    SearchGraphService,
    SearchResolverService,
    CardAliasService,
    EffectVocabularyService,
    CardEffectsService,
  ],
  exports: [SearchGraphService],
})
export class SearchGraphModule {}
