addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Replace with your actual server IP address
  const BACKEND_HOST = '162.246.16.123' // <- CHANGE THIS!
  
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
  
  // For authentication requests, pass through without modification
  if (isWooCommerceAuth || isPrintfulRequest) {
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
      redirect: 'manual'
    })
    
    const newResponse = new Response(authResponse.body, {
      status: authResponse.status,
      statusText: authResponse.statusText,
      headers: authResponse.headers
    })
    
    newResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    
    if (authResponse.headers.get('Location')) {
      newResponse.headers.set('Location', authResponse.headers.get('Location'))
    }
    
    return newResponse
  }
  
  // For regular requests
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
      body: request.body
    })
    
    const response = await fetch(modifiedRequest)
    
    const newResponse = new Response(response.body, response)
    
    // Add security headers
    newResponse.headers.set('X-Content-Type-Options', 'nosniff')
    newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN')
    
    return newResponse
    
  } catch (error) {
    return new Response('Error connecting to backend server', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}
