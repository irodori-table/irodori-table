/**
 * Minimal ambient types for the bit of jsdom `src/tests/setup.ts` uses.
 *
 * jsdom ships no types of its own and `@types/jsdom` is not a dependency here;
 * declaring the one constructor and the two properties we touch is cheaper
 * than pulling in a full type package for a single test-setup call.
 */
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string });
    readonly window: {
      readonly localStorage: Storage;
      readonly sessionStorage: Storage;
    };
  }
}
