// Remotion's webpack config emits font files as assets; importing one yields its bundled URL.
declare module "*.woff2" {
  const url: string;
  export default url;
}
