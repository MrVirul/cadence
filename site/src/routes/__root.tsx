import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "@/styles.css?url";
import { SITE_URL } from "@/lib/config";
import { copy } from "@/copy";
import { NotFoundPage } from "./404";

// JSON-LD structured data for the Cadence SaaS product and organisation.
// Placed in the root so it appears on every prerendered page.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "Cadence",
      description: copy.brand.metaDescription,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Cadence",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: copy.brand.metaDescription,
      url: `${SITE_URL}/`,
      image: `${SITE_URL}/og.png`,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free to get started",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "Cadence",
      url: `${SITE_URL}/`,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/cadence-mark.svg`,
        width: 32,
        height: 32,
      },
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: `${SITE_URL}/`,
      name: `${copy.brand.name} — ${copy.brand.tagline}`,
      description: copy.brand.metaDescription,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    },
  ],
};

// Document shell for every page. `head` provides metadata, canonical links,
// Open Graph, and Twitter card tags.
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${copy.brand.name} — ${copy.brand.tagline}` },
      { name: "description", content: copy.brand.metaDescription },
      { name: "theme-color", content: "#FAFAF9" },
      { name: "color-scheme", content: "light" },
      // Tell crawlers this is a normal indexable page
      { name: "robots", content: "index, follow" },

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
      { rel: "sitemap", href: "/sitemap.xml", type: "application/xml" },
    ],
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* JSON-LD structured data — rendered as raw script so the JSON is not escaped */}
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: structured data must be raw JSON
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="antialiased min-h-screen bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
