/**
 * We have a method fetchJson that encodes JS Object to
 * a string automatically for `body` property.
 * Sadly, Typescript doesn't allow us to extend RequestInit
 * and override body prop because it is incompatible, so we
 * omit it first from the base RequestInit.
 */
export interface LionRequestInit extends Omit<RequestInit, 'body'> {
  body?: BodyInit | null | Object;
  request?: CacheRequest;
}

export interface AjaxConfig {
  addAcceptLanguage: boolean;
  xsrfCookieName: string | null;
  xsrfHeaderName: string | null;
  cacheOptions: CacheOptionsWithIdentifier;
  jsonPrefix: string;
}

export type RequestInterceptor = (request: Request) => Promise<Request | Response>;
export type ResponseInterceptor = (response: Response) => Promise<Response>;

export interface CacheConfig {
  expires: string;
}

export type Params = { [key: string]: any };

export type RequestIdentificationFn = (
  request: Partial<CacheRequest>,
  serializeSearchParams: (params: Params) => string,
) => string;

export interface CacheOptions {
  useCache?: boolean;
  methods?: string[];
  timeToLive?: number;
  invalidateUrls?: string[];
  invalidateUrlsRegex?: RegExp;
  getRequestId?: RequestIdentificationFn;
}

export interface CacheOptionsWithIdentifier extends CacheOptions {
  getCacheIdentifier: () => string;
}

export interface ValidatedCacheOptions extends CacheOptions {
  useCache: boolean;
  methods: string[];
  timeToLive: number;
  getRequestId: RequestIdentificationFn;
}

export interface CacheRequestExtension {
  requestCache?: any; // TODO: type this
  cacheOptions?: CacheOptions;
  adapter: any;
  status: number;
  statusText: string;
  params: Params;
}

export interface CacheResponseRequest {
  requestCache?: any; // TODO: type this
  cacheOptions?: CacheOptions;
  method: string;
}

export interface CacheResponseExtension {
  request: CacheResponseRequest;
  data: object | string;
  fromCache?: boolean;
}

export type CacheRequest = Request & Partial<CacheRequestExtension>;

export type CacheResponse = Response & Partial<CacheResponseExtension>;

export type CachedRequestInterceptor = (
  request: CacheRequest,
) => Promise<CacheRequest | CacheResponse>;

export type CachedResponseInterceptor = (request: CacheResponse) => Promise<CacheResponse>;
