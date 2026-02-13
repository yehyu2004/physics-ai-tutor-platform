export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaults: { pageSize?: number } = {}
): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || String(defaults.pageSize || 20), 10))
  );
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

export function paginatedResponse<T>(
  data: T[],
  totalCount: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / params.pageSize),
    },
  };
}
