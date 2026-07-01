export default function middleware(request) {
  const country = request.headers.get('x-vercel-ip-country') || 'US';
  const region = country === 'IN' ? 'IN' : 'GLOBAL';
  
  // Set the request header using Vercel's x-middleware-request protocol
  const response = new Response(null, {
    headers: {
      'x-middleware-request-x-pricing-region': region
    }
  });
  return response;
}

export const config = {
  matcher: ['/api/payments/:path*', '/passport/checkout'],
};
