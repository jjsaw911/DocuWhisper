# Production VM Cutover

This is the final cutover checklist for moving DocuWhisper from `beta.docuwhisper.com` to `docuwhisper.com` on the existing VM.

## Already completed

- App runtime `APP_BASE_URL` on the VM is set to `https://docuwhisper.com`
- App container is running with the updated production base URL
- App copy no longer shows the beta migration banner

## Still required before DNS cutover is considered complete

### 1. Firebase / Identity Platform authorized domains

In Firebase Authentication / Identity Platform, make sure these domains are authorized:

- `docuwhisper.com`
- `www.docuwhisper.com`
- `beta.docuwhisper.com`

### 2. Nginx server blocks on the VM

The VM currently has explicit nginx config for `beta.docuwhisper.com`, but not for the production hostnames.

There is a ready-made template in [scripts/docuwhisper.com.nginx.conf](/Users/josephsawyer/Documents/DocuWhisper/scripts/docuwhisper.com.nginx.conf) and a helper installer in [scripts/install-production-nginx.sh](/Users/josephsawyer/Documents/DocuWhisper/scripts/install-production-nginx.sh).

If you want to install it manually, create `/etc/nginx/sites-available/docuwhisper.com` with:

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name docuwhisper.com www.docuwhisper.com;

  client_max_body_size 120M;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Then enable it:

```bash
sudo ln -sf /etc/nginx/sites-available/docuwhisper.com /etc/nginx/sites-enabled/docuwhisper.com
sudo nginx -t
sudo systemctl reload nginx
```

Or run the prepared helper from the repo root:

```bash
./scripts/install-production-nginx.sh
```

### 3. TLS certificate for production hostnames

Once DNS is pointing to the VM, issue the certificate:

```bash
sudo certbot --nginx -d docuwhisper.com -d www.docuwhisper.com
```

Then verify nginx again:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Stripe webhook endpoint

In Stripe Dashboard, update or add the webhook endpoint:

- `https://docuwhisper.com/api/stripe/webhook`

Make sure these events are subscribed:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

If the signing secret changes, update `.env.google`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

Then restart the container.

### 5. DNS

Point these hostnames at the VM IP:

- `docuwhisper.com`
- `www.docuwhisper.com`

Recommended:

- keep `beta.docuwhisper.com` pointed at the same VM during the overlap window
- later redirect `beta.docuwhisper.com` to `https://docuwhisper.com`

## Post-cutover smoke test

After DNS and TLS are live:

```bash
curl -I https://docuwhisper.com
curl -I https://www.docuwhisper.com
```

Then manually verify:

1. `https://docuwhisper.com/api/login`
2. sign up / sign in
3. generate a SOAP note
4. open `/admin`
5. open `/subscription`
6. run one Stripe checkout test

## Current blocker summary

The only meaningful blocker that could not be completed from the app workspace is root-level nginx / certbot work on the VM.
