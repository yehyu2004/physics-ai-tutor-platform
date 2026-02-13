/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "bcryptjs",
      "@prisma/client",
      "@prisma/adapter-pg",
      "pg",
      "@anthropic-ai/sdk",
      "jszip",
      "nodemailer",
      "resend",
      "openai",
    ],
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "react-syntax-highlighter",
      "recharts",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "react-markdown",
      "katex",
      "dompurify",
    ],
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
