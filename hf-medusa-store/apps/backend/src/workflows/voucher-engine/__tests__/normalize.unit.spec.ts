import { normalizeCode } from '../lib/normalize'

describe('VoucherEngine · normalizeCode (SRS §5.2 V1)', () => {
  it('trims surrounding whitespace and uppercases', () => {
    expect(normalizeCode(' save10 ')).toBe('SAVE10')
  })

  it('uppercases mixed-case input', () => {
    expect(normalizeCode('MeGa20')).toBe('MEGA20')
  })

  it('returns empty string for null / undefined / empty', () => {
    expect(normalizeCode(null)).toBe('')
    expect(normalizeCode(undefined)).toBe('')
    expect(normalizeCode('   ')).toBe('')
  })

  it('is idempotent', () => {
    const once = normalizeCode(' shuttle20 ')
    expect(normalizeCode(once)).toBe(once)
    expect(once).toBe('SHUTTLE20')
  })
})
