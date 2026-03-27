# Barter Backend Manual Test Cases

Use this as the full manual test checklist in Postman. The cleanest way is to keep two authenticated contexts: one for Seller and one for Buyer. Since the collection uses a single access token, either use two Postman environments or keep two tabs/environments and switch tokens when needed.

## Setup

1. Authenticate Seller and save Seller token.
2. Authenticate Buyer and save Buyer token.
3. Create one target product as Seller.
4. Create one or two offered products as Buyer.
5. Optional for override tests: create more buyer accounts and one offered product per buyer.
6. Keep these IDs handy:
   - target product id
   - buyer offered product ids
   - request ids
   - transaction id

## Happy Path: Full Exchange

1. Seller creates target product.
   Expected:
   - status=ACTIVE
   - isListed=true
   - isPreOwned set as created
   - exchangeCount=0

2. Buyer creates offered product(s).
   Expected:
   - ownership is Buyer
   - products appear under Buyer

3. Buyer creates request on Seller's product with offerType=PRODUCT or MIXED.
   Expected:
   - request created
   - active offer created
   - request visible in Seller received list

4. Seller fetches request thread and accepts request.
   Expected:
   - request becomes ACCEPTED
   - reservation becomes active
   - product becomes RESERVED
   - transaction becomes INITIATED

5. Buyer calls GET /transactions/active?requestId=...
   Expected:
   - one active transaction returned
   - returned transaction id matches accepted request

6. Buyer generates OTP.
   Expected:
   - transaction becomes IN_PROGRESS
   - OTP returned in response
   - expiry is about 5 minutes ahead

7. Seller verifies OTP.
   Expected:
   - transaction becomes COMPLETED
   - reservation becomes COMPLETED
   - target product owner changes to Buyer
   - offered product owner changes to Seller
   - all transferred products become:
     - status=EXCHANGED
     - isListed=false
     - isPreOwned=true
     - exchangeCount=1
     - lastExchangedAt set

8. Fetch each transferred product by id.
   Expected:
   - owner ids are swapped correctly
   - exchanged identifiers are present
   - products do not show in normal active discovery feed

9. Fetch ownership history for all transferred products.
   Expected:
   - previous ownership record has releasedAt
   - new ownership record created for new owner

## Manual Relist Path

1. New owner of exchanged target product calls PATCH /products/:id/relist.
   Expected:
   - status=ACTIVE
   - isListed=true
   - lifecycleVersion increments
   - isPreOwned=true remains true
   - exchangeCount remains unchanged
   - lastExchangedAt remains set

2. Check discovery feed again.
   Expected:
   - relisted product appears
   - non-relisted exchanged products still do not appear

3. Try relisting an already active listed product.
   Expected:
   - 409 already active

## Request Validation Cases

1. Buyer requests own product.
   Expected:
   - 400

2. Buyer sends NONE offer for non-free product.
   Expected:
   - 400

3. Buyer sends MONEY or MIXED for product that does not allow money.
   Expected:
   - 400

4. Buyer includes target product in offeredProducts or visibleProducts.
   Expected:
   - 400

5. Buyer uses offered product not owned by buyer.
   Expected:
   - 400

6. Buyer requests product that is REMOVED or in cooldown.
   Expected:
   - 409

## Negotiation Cases

1. Buyer creates request, Seller counters, Buyer counters back.
   Expected:
   - currentTurn flips correctly
   - previous active offers become SUPERSEDED
   - latest offer is ACTIVE

2. Wrong actor tries to counter when not their turn.
   Expected:
   - 409

3. Wrong actor tries to accept when not their turn.
   Expected:
   - 409

4. Reject request.
   Expected:
   - request becomes REJECTED
   - active offers become REJECTED
   - reservation released if this request held it

5. Cancel request.
   Expected:
   - request becomes CANCELLED
   - active offers become CANCELLED
   - reservation released if this request held it

## Reservation Override Cases

1. Seller accepts Buyer A request.
2. Buyer B creates competing request while product is reserved.
   Expected:
   - request creation allowed
   - warning may indicate product is reserved

3. Seller accepts Buyer B request.
   Expected:
   - previous accepted request becomes overridden/rejected
   - previous active transaction becomes CANCELLED
   - previous pending OTPs become invalid
   - same product still has only one active reservation
   - same product still has only one active transaction

4. After override, Buyer A tries to continue old OTP flow.
   Expected:
   - old transaction lookup fails or shows cancelled
   - old OTP verify cannot complete anything

## Override Threshold and Cooldown

1. Repeat override scenario across multiple buyers on the same product.
2. On the last safe threshold, accept response should include warning.
3. Continue until limit is exceeded.
   Expected:
   - accept fails with 409
   - product becomes blocked
   - status=REMOVED
   - isListed=false
   - cooldownUntil set

4. Try creating request during cooldown.
   Expected:
   - 409

5. Try relisting during cooldown.
   Expected:
   - 409

6. After cooldown expires, relist should work.
   Expected:
   - product returns to ACTIVE

## OTP Cases

1. Seller tries to generate OTP instead of Buyer.
   Expected:
   - 403

2. Buyer tries to verify OTP instead of Seller.
   Expected:
   - 403

3. Verify wrong OTP.
   Expected:
   - 400

4. Enter wrong OTP repeatedly until limit.
   Expected:
   - OTP invalidated after max attempts
   - further verify fails

5. Generate OTP twice before verification.
   Expected:
   - latest OTP only is valid
   - previous OTP becomes invalid

6. Wait more than 5 minutes before verify.
   Expected:
   - OTP expired

7. Try verifying OTP after transaction already completed.
   Expected:
   - 409

## Exchange Integrity Cases

1. Before OTP verify, manually transfer or alter one offered product owner using the ownership endpoint.
   Expected:
   - final OTP verification should fail because offered product no longer belongs to expected owner

2. Before OTP verify, create another active reservation or transaction on one of the offered products if possible.
   Expected:
   - final OTP verification should fail due to conflicting workflow lock

3. Use an offer with multiple offered products.
   Expected:
   - all offered products transfer together
   - all are marked EXCHANGED
   - all ownership histories update

4. Use a free product request with NONE.
   Expected:
   - only target product transfers
   - no offered products transfer
   - completion still succeeds

## Discovery and Listing Cases

1. Check default product discovery after exchange completion.
   Expected:
   - exchanged products are hidden because isListed=false

2. Check discovery after relist.
   Expected:
   - only relisted items return

3. Query by status=EXCHANGED.
   Expected:
   - exchanged items can still be retrieved if your endpoint allows that status filter and isListed condition is not excluding them for that use case
   - if hidden, that is a product decision to confirm

## Ownership History Cases

1. Brand-new product before any exchange.
   Expected:
   - one active ownership record

2. After one successful exchange.
   Expected:
   - old record closed
   - new record opened
   - no duplicate open ownership rows

3. After second exchange and relist cycle.
   Expected:
   - exchangeCount=2
   - ownership history shows full chain

## Recommended Test Order

1. Full happy path exchange.
2. Manual relist.
3. Negotiation and rejection or cancel.
4. Override and threshold.
5. OTP failure cases.
6. Exchange integrity race cases.
7. Discovery and ownership history verification.

## High-Value Assertions

1. One product never has more than one active reservation.
2. One product never has more than one active transaction.
3. Completed exchange always updates all participating products atomically.
4. Exchanged products are not auto-listed.
5. New owner alone can relist.
6. isPreOwned, exchangeCount, and lastExchangedAt stay consistent across cycles.

## Compact Execution Runbook

Use two Postman environments:
- SellerEnv
- BuyerEnv

Create these variables in both environments:
- baseUrl
- accessToken
- currentProductId
- buyerOfferedProductId1
- buyerOfferedProductId2
- currentRequestId
- currentTransactionId
- lastAcceptWarning

### A. Token Setup

1. In SellerEnv, run auth OTP flow and save accessToken.
2. In BuyerEnv, run auth OTP flow and save accessToken.

### B. Data Creation

1. SellerEnv -> Create Product.
   - Save product id into SellerEnv.currentProductId.
2. Copy SellerEnv.currentProductId to BuyerEnv.currentProductId.
3. BuyerEnv -> Create Product (offered product 1).
   - Save id into BuyerEnv.buyerOfferedProductId1.
4. Optional: BuyerEnv -> Create Product (offered product 2).
   - Save id into BuyerEnv.buyerOfferedProductId2.

### C. Request and Acceptance Flow

1. BuyerEnv -> Create Product Request.
   - productId = {{currentProductId}}
   - offeredProducts includes buyerOfferedProductId1 (and buyerOfferedProductId2 if testing multi-product swap)
2. Save currentRequestId from BuyerEnv and copy to SellerEnv.currentRequestId.
3. SellerEnv -> Get Request Offers (optional verify).
4. SellerEnv -> Accept Request.
   - If warning present, save in SellerEnv.lastAcceptWarning.
5. Copy SellerEnv.currentRequestId back to BuyerEnv.currentRequestId if needed.

### D. Transaction and OTP Flow

1. BuyerEnv -> Get Active Transaction with requestId.
   - Save id as BuyerEnv.currentTransactionId.
2. Copy BuyerEnv.currentTransactionId to SellerEnv.currentTransactionId.
3. BuyerEnv -> Generate Transaction OTP.
   - Keep OTP from response (temporary manual copy).
4. SellerEnv -> Verify Transaction OTP using OTP from previous step.

### E. Post-Completion Validation

1. BuyerEnv -> Get Product (target product).
   - Expect owner = Buyer
   - status = EXCHANGED
   - isListed = false
   - exchangeCount incremented
   - lastExchangedAt set
2. SellerEnv -> Get Product (buyer offered product id).
   - Expect owner = Seller
   - status = EXCHANGED
   - isListed = false
3. Validate ownership history for each transferred product.

### F. Manual Relist Validation

1. New owner environment -> PATCH /products/:id/relist.
2. Get Product and assert:
   - status = ACTIVE
   - isListed = true
   - lifecycleVersion incremented
   - isPreOwned = true still
   - exchangeCount unchanged after relist

### G. Fast Edge-Case Matrix

Run these as short checks after the happy path:

1. Wrong actor generates OTP -> expect 403.
2. Wrong actor verifies OTP -> expect 403.
3. Wrong OTP -> expect 400.
4. Expired OTP -> expect 400.
5. Second OTP generation invalidates previous OTP.
6. Accept on non-turn actor -> expect 409.
7. Counter on non-turn actor -> expect 409.
8. Request with invalid offer type rules -> expect 400.
9. Relist during cooldown -> expect 409.
10. Override chain until threshold -> warning then block behavior.

### H. Suggested Test Session Order

1. A -> B -> C -> D -> E -> F for full golden path.
2. G(1-5) for OTP/security edges.
3. G(6-8) for negotiation/request validation.
4. Override and cooldown scenarios from main checklist.