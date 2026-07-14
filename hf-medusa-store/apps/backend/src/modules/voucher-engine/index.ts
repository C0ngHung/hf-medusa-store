import { Module } from '@medusajs/framework/utils'
import VoucherEngineService from './service'

export const VOUCHER_ENGINE_MODULE = 'voucherEngine'

export default Module(VOUCHER_ENGINE_MODULE, {
  service: VoucherEngineService,
})
