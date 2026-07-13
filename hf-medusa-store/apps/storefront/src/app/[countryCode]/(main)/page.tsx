import { redirect } from "next/navigation"

// Home page defaults straight into the store listing — the badminton catalog is
// the landing experience, so `/` (per-country root) redirects to `/{cc}/store`.
export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params

  redirect(`/${countryCode}/store`)
}
