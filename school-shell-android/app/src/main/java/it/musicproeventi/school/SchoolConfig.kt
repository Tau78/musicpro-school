package it.musicproeventi.school

object SchoolConfig {
  const val START_URL = "https://school.musicproeventi.it/dashboard"
  const val PANEL_HOST = "school.musicproeventi.it"

  private val allowedExact = setOf(
    PANEL_HOST,
    "ecommerce.nexi.it",
    "int-ecommerce.nexi.it",
  )

  fun isAllowedHost(host: String?): Boolean {
    val h = host?.lowercase() ?: return false
    if (h in allowedExact) return true
    if (h.endsWith(".$PANEL_HOST")) return true
    if (h.endsWith(".supabase.co")) return true
    if (h.endsWith(".nexi.it")) return true
    return false
  }
}
