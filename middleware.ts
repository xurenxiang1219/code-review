import { NextRequest, NextResponse } from 'next/server';

/**
 * 路径配置
 */
const PUBLIC_PATHS = [
  '/login',
  '/api/health',
  '/api/auth/login',
  '/_next',
  '/favicon.ico',
];

const SKIP_AUTH_PATHS = [
  '/api/webhook',
];

/**
 * 简单的JWT token验证（Edge Runtime兼容）
 * @param token - JWT token
 * @returns 是否有效
 */
function isValidToken(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    
    return payload.exp && payload.exp > now;
  } catch {
    return false;
  }
}

/**
 * 检查是否为公开路径
 * @param pathname - 路径
 * @returns 是否为公开路径
 */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => pathname.startsWith(path));
}

/**
 * 检查是否跳过认证的路径
 * @param pathname - 路径
 * @returns 是否跳过认证
 */
function isSkipAuthPath(pathname: string): boolean {
  return SKIP_AUTH_PATHS.some(path => pathname.startsWith(path));
}

/**
 * 添加安全响应头
 * @param response - HTTP 响应对象
 * @returns 添加安全头后的响应
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['*'];
  if (allowedOrigins.includes('*')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  response.headers.set('Access-Control-Max-Age', '86400');

  return response;
}

/**
 * Next.js 中间件主函数
 * @param request - HTTP 请求对象
 * @returns 响应或继续处理
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();
  
  const response = NextResponse.next();
  response.headers.set('X-Request-ID', requestId);

  if (isPublicPath(pathname)) {
    return addSecurityHeaders(response);
  }

  if (isSkipAuthPath(pathname)) {
    return addSecurityHeaders(response);
  }

  if (!pathname.startsWith('/api/')) {
    return addSecurityHeaders(response);
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'X-Request-ID': requestId,
        'WWW-Authenticate': 'Bearer realm="API", error="invalid_token"',
      },
    });
  }

  const token = authHeader.substring(7);
  if (!isValidToken(token)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'X-Request-ID': requestId,
        'WWW-Authenticate': 'Bearer realm="API", error="invalid_token"',
      },
    });
  }

  return addSecurityHeaders(response);
}

/**
 * 中间件配置
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};