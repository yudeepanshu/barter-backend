# Push Notification System Design (Buyer Request -> Seller Alert)

## Goals
- Notify listing owner (seller) when a buyer creates a request on their listed product.
- Persist notifications so users can see history in-app (bell on feed page).
- Support multiple devices per user.
- Keep API request latency low while still attempting push delivery.

## Scope
- Backend:
  - Device token registration/unregistration.
  - Notification persistence and read/unread management.
  - Push dispatch via Expo Push API.
  - Trigger on request creation.
- Mobile:
  - Request notification permission.
  - Register Expo token after auth.
  - Bell UI on feed top with notifications list.
  - Mark notifications as read.

## Architecture
1. Device Registration
- Mobile gets Expo push token and registers it to backend.
- Backend stores token as active PushDevice for the authenticated user.

2. Event Creation
- On `createRequest`, backend creates a Notification record for seller.

3. Push Delivery
- Backend sends push to all active seller tokens through Expo Push endpoint.
- Invalid/failed tokens are marked inactive for future sends.

4. In-App Inbox
- Feed bell fetches persisted notifications from backend.
- Unread count is shown on bell badge.
- Opening list allows read/mark-all-read.

## Data Model Additions
- `PushDevice`
  - `id`, `userId`, `expoPushToken`, `platform`, `deviceId`, `isActive`, `lastSeenAt`, timestamps.
  - Unique on `expoPushToken` and `(userId, expoPushToken)`.
- `Notification`
  - `id`, `userId`, `type`, `title`, `body`, `data (json)`, `isRead`, `readAt`, `createdAt`, `updatedAt`.

## API Endpoints
- `POST /api/notifications/devices`
  - Register token.
- `POST /api/notifications/devices/unregister`
  - Mark token inactive.
- `GET /api/notifications?limit&cursor&unreadOnly`
  - List notifications with cursor pagination.
- `POST /api/notifications/:id/read`
  - Mark single notification as read.
- `POST /api/notifications/read-all`
  - Mark all notifications as read.

## Notification Event Types
- `REQUEST_CREATED`
  - Trigger: buyer creates request on seller product.
  - Payload data:
    - `requestId`
    - `productId`
    - `buyerId`
    - `buyerName`

## Mobile UX
- Feed header adds bell icon (top-right).
- Bell badge displays unread count.
- Tapping bell opens a modal/sheet listing notifications.
- Tapping item marks it read and navigates to relevant screen (request or product detail).

## Reliability and Safety
- Delivery best-effort and non-blocking for request API path.
- If Expo returns `DeviceNotRegistered`, token is deactivated.
- Errors are logged; notification record remains for in-app visibility.
- Idempotent device registration via upsert pattern.

## Rollout Plan
1. Add schema + migration + backend module.
2. Integrate createRequest trigger.
3. Add client SDK methods and mobile hooks.
4. Add feed bell UI and read-state flows.
5. Test with two devices/accounts and validate push + in-app history.

## Acceptance Criteria
- Seller receives push when buyer creates request.
- Seller sees same event in bell list even if push fails.
- Unread badge decrements when notifications are read.
- Non-owner users do not receive these owner-specific events.
