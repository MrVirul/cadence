import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "@/styles.css?url";
import { SITE_URL } from "@/lib/config";
import { copy } from "@/copy";

// Document shell for every page. `head` provides metadata, canonical links,
// Open Graph, and Twitter card tags.
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${copy.brand.name} — ${copy.brand.tagline}` },
      { name: "description", content: copy.brand.metaDescription },
      { name: "theme-color", content: "#4F46E5" },

      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: copy.brand.name },
      {
        property: "og:title",
        content: `${copy.brand.name} — ${copy.brand.tagline}`,
      },
      { property: "og:description", content: copy.brand.metaDescription },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Cadence — Plan the week. Ship one thing.",
      },

      // Twitter Cards
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: `${copy.brand.name} — ${copy.brand.tagline}`,
      },
      { name: "twitter:description", content: copy.brand.metaDescription },
      { name: "twitter:image", content: `${SITE_URL}/og.png` },
      {
        name: "twitter:image:alt",
        content: "Cadence — Plan the week. Ship one thing.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: `${SITE_URL}/` },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased min-h-screen bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
