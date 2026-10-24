pluginManagement {
  repositories {
    // Optional curl mirror when Java cannot reach dl.google.com (this Mac).
    val localMaven = file("/tmp/android-maven-local")
    if (localMaven.isDirectory) {
      maven { url = uri(localMaven) }
    }
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    val localMaven = file("/tmp/android-maven-local")
    if (localMaven.isDirectory) {
      maven { url = uri(localMaven) }
    }
    google()
    mavenCentral()
  }
}
rootProject.name = "MusicProSchool"
include(":app")
