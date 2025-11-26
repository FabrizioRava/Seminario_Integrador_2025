
// src/common/dto/api-error-response.dto.ts
export class ApiErrorResponseDto {
  timestamp: string;                  // ISO string
  path: string;                       // request URL
  statusCode: number;                 // HTTP status
  error: string;                      // Error name or generic
  message: string | string[];         // Message or validation array
  requestId?: string;                 // Correlation ID
  details?: {
    method?: string;
    bodyKeys?: string[];
    headerKeys?: string[];
  };
}
