declare const __dirname: string;

declare module 'path' {
  const path: {
    resolve: (...paths: string[]) => string;
  };
  export default path;
}
