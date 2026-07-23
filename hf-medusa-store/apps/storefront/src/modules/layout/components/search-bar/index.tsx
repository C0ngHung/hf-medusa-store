"use client"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

/**
 * Simple product search: submits the term to the store page as `?q=`, which
 * Medusa's /store/products endpoint uses for server-side full-text search.
 * Client component because it needs router navigation on submit.
 */
const SearchBar = () => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const searchParams = useSearchParams()

  const [term, setTerm] = useState(searchParams.get("q") ?? "")

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = term.trim()
    router.push(
      q
        ? `/${countryCode}/store?q=${encodeURIComponent(q)}`
        : `/${countryCode}/store`,
    )
  }

  return (
    <form onSubmit={onSubmit} className="hidden small:flex items-center">
      <input
        type="search"
        name="q"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Tìm sản phẩm…"
        aria-label="Search products"
        data-testid="nav-search-input"
        className="h-8 w-40 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-ui-fg-base placeholder:text-ui-fg-muted focus:outline-none focus:border-ui-border-interactive txt-compact-small"
      />
    </form>
  )
}

export default SearchBar
