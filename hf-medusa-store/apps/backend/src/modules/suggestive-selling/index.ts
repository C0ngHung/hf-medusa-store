import { Module } from '@medusajs/framework/utils'
import SuggestiveSellingService from './service'

export const SUGGESTIVE_SELLING_MODULE = 'suggestiveSelling'

export default Module(SUGGESTIVE_SELLING_MODULE, {
  service: SuggestiveSellingService,
})
