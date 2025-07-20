addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Replace with your actual server IP or domain
  const BACKEND_HOST = 'server_ip_or_main_domain'
  
  // WooCommerce API and Printful authentication paths
  const WOOCOMMERCE_API_PATHS = [
    '/wc-api/',
    '/wp-json/wc/',
    '/wp-json/wc-auth/',
    '/?wc-auth-version=',
    '/wc-auth/v1/',
    '/wc-auth/v2/'
  ]
  
  const PRINTFUL_PATHS = [
    '/wc-api/printful',
    '/wp-json/printful/',
    '/printful-webhook',
    '/?wc-api=printful'
  ]
  
  // Check if this is a WooCommerce API or Printful request
  const isWooCommerceAuth = WOOCOMMERCE_API_PATHS.some(path => 
    url.pathname.includes(path) || url.search.includes('wc-auth')
  )
  
  const isPrintfulRequest = PRINTFUL_PATHS.some(path => 
    url.pathname.includes(path) || url.search.includes('printful')
  )
  
  // Create backend URL
  const backendUrl = new URL(request.url)
  backendUrl.hostname = BACKEND_HOST
  backendUrl.protocol = 'https:'
  
  // For authentication requests, we need to be extra careful
  if (isWooCommerceAuth || isPrintfulRequest) {
    // Pass through authentication requests without modification
    const authResponse = await fetch(backendUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers),
        'Host': 'shop.theaegisalliance.com',
        'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
        'X-Forwarded-Proto': 'https',
        'X-Real-IP': request.headers.get('CF-Connecting-IP') || ''
      },
      body: request.body,
      redirect: 'manual' // Important for OAuth flows
    })
    
    // Create response preserving all headers
    const newResponse = new Response(authResponse.body, {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers: authResponse.headers
    })
    
    // Ensure no caching for auth requests
    newResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    newResponse.headers.set('Pragma', 'no-cache')
    newResponse.headers.set('Expires', '0')
    
    // Preserve location header for redirects
    if (authResponse.headers.get('Location')) {
      newResponse.headers.set('Location', authResponse.headers.get('Location'))
    }
    
    return newResponse
  }
  
  // For regular requests, apply caching and optimizations
  try {
    const modifiedRequest = new Request(backendUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers),
        'Host': 'shop.theaegisalliance.com',
        'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
        'X-Forwarded-Proto': 'https',
        'X-Real-IP': request.headers.get('CF-Connecting-IP') || ''
      },
      body: request.body,
      redirect: 'follow'
    })
    
    // Determine if we should cache this request
    const shouldCache = request.method === 'GET' && 
                       !url.pathname.includes('/wp-admin') &&
                       !url.pathname.includes('/wp-login') &&
                       !url.pathname.includes('/cart') &&
                       !url.pathname.includes('/checkout') &&
                       !url.pathname.includes('/my-account')
    
    const fetchOptions = shouldCache ? {
      cf: {
        cacheTtl: 300,
        cacheEverything: true,
        cacheKey: `${url.hostname}${url.pathname}${url.search}`
      }
    } : {}
    
    const response = await fetch(modifiedRequest, fetchOptions)
    
    // Create new response
    const newResponse = new Response(response.body, response)
    
    // Set appropriate cache headers
    if (shouldCache && response.status === 200) {
      newResponse.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300')
      newResponse.headers.set('X-Cache-Status', 'HIT')
    } else {
      newResponse.headers.set('Cache-Control', 'no-cache, private')
      newResponse.headers.set('X-Cache-Status', 'BYPASS')
    }
    
    // Add CORS headers if needed
    if (request.headers.get('Origin')) {
      newResponse.headers.set('Access-Control-Allow-Origin', request.headers.get('Origin'))
      newResponse.headers.set('Access-Control-Allow-Credentials', 'true')
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
    
    return newResponse
    
  } catch (error) {
    console.error('Worker error:', error)
    return new Response(`Backend connection error: ${error.message}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}
