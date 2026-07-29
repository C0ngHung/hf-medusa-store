export const OPTION_VALUE_QUERY_KEY = "optionValueIds"

export type OptionValueIds = string[]

export const parseOptionValueIds = (
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>
): OptionValueIds => {
  if (typeof (searchParams as URLSearchParams).getAll === "function") {
    const values = (searchParams as URLSearchParams).getAll(OPTION_VALUE_QUERY_KEY)
    return Array.from(
      new Set(
        values
          .flatMap((v) => v.split(","))
          .map((v) => v.trim())
          .filter(Boolean)
      )
    )
  }

  const paramValue = (
    searchParams as Record<string, string | string[] | undefined>
  )[OPTION_VALUE_QUERY_KEY]

  if (Array.isArray(paramValue)) {
    return Array.from(
      new Set(
        paramValue
          .flatMap((v) => v.split(","))
          .map((v) => v.trim())
          .filter(Boolean)
      )
    )
  }

  if (typeof paramValue === "string" && paramValue.length > 0) {
    return Array.from(
      new Set(
        paramValue
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      )
    )
  }

  return []
}
