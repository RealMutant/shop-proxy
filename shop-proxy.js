addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Use your actual server IP address
  const BACKEND_IP = '162.246.16.123' // Replace with your actual server IP
  const BACKEND_HOST = 'shop.theaegisalliance.com' // Your WordPress expects this host
  
  // WooCommerce API and Printful authentication paths
  const WOOCOMMERCE_API_PATHS = [
    '/wc-api/',
    '/wp-json/wc/',
    '/wp-json/wc-auth/',
    '/wc-auth/v1/',
    '/wc-auth/v2/',
    '/wp-json/wc-analytics/',
    '/wp-json/wc-admin/',
    '/wp-json/wc-blocks/'
  ]
  
  const PRINTFUL_PATHS = [
    '/wc-api/printful',
    '/wp-json/printful/',
    '/printful-webhook',
    '/?wc-api=printful'
  ]
  
  // Check if this is a WooCommerce API or Printful request
  const isWooCommerceAuth = WOOCOMMERCE_API_PATHS.some(path => 
    url.pathname.includes(path) || url.search.includes('wc-auth-version')
  )
  
  const isPrintfulRequest = PRINTFUL_PATHS.some(path => 
    url.pathname.includes(path) || url.search.includes('printful')
  )
  
  // Create backend URL using IP address
  const backendUrl = new URL(request.url)
  backendUrl.hostname = BACKEND_IP
  backendUrl.protocol = 'https:'
  
  // Prepare headers - CRITICAL: Set the correct Host header
  const headers = new Headers(request.headers)
  
  // This is the key to avoiding 1003 error - tell your server which site to serve
  headers.set('Host', BACKEND_HOST)
  headers.set('X-Forwarded-Host', BACKEND_HOST)
  headers.set('X-Forwarded-Proto', 'https')
  headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '')
  headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '')
  
  // Remove Cloudflare headers that might interfere
  headers.delete('cf-ray')
  headers.delete('cf-visitor')
  headers.delete('cf-connecting-ip')
  
  try {
    // For authentication requests, handle redirects manually
    if (isWooCommerceAuth || isPrintfulRequest) {
      const authResponse = await fetch(backendUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: 'manual' // Important for OAuth flow
      })
      
      // Create response
      const newResponse = new Response(authResponse.body, {
        status: authResponse.status,
        statusText: authResponse.statusText,
        headers: authResponse.headers
      })
      
      // Handle redirects properly for OAuth
      if (authResponse.status >= 300 && authResponse.status < 400) {
        const location = authResponse.headers.get('Location')
        if (location) {
          // Fix redirect URLs to use the public domain
          const redirectUrl = new URL(location, url)
          if (redirectUrl.hostname === BACKEND_IP || redirectUrl.hostname === BACKEND_HOST) {
            redirectUrl.hostname = 'shop.theaegisalliance.com'
            redirectUrl.protocol = 'https:'
          }
          newResponse.headers.set('Location', redirectUrl.toString())
        }
      }
      
      // Set security headers
      newResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      newResponse.headers.set('X-Robots-Tag', 'noindex, nofollow')
      
      return newResponse
    }
    
    // For regular requests
    const response = await fetch(backendUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: 'follow'
    })
    
    // Clone response to modify headers
    const newResponse = new Response(response.body, response)
    
    // Add security headers
    newResponse.headers.set('X-Content-Type-Options', 'nosniff')
    newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN')
    newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    
    // Fix any hardcoded URLs in the response
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      const text = await response.text()
      // Replace any occurrence of the IP with the domain
      const modifiedText = text
        .replace(new RegExp(`https?://${BACKEND_IP}`, 'g'), 'https://shop.theaegisalliance.com')
        .replace(new RegExp(BACKEND_IP, 'g'), 'shop.theaegisalliance.com')
      
      return new Response(modifiedText, {
        status: response.status,
        statusText: response.statusText,
        headers: newResponse.headers
      })
    }
    
    return newResponse
    
  } catch (error) {
    console.error('Worker error:', error)
    return new Response('Error connecting to backend server: ' + error.message, {
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}
