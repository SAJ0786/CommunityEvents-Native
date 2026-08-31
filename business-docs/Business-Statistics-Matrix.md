# Community Businesses Australia — Statistics Matrix

## Counting matrix

| User action | Counter key | What one count means | Overall dashboard | Selected-business dashboard |
|---|---|---|---|---|
| Open a public business page | `page_view` | One business-detail screen access | Total accesses across filtered businesses | Accesses for the selected business |
| Open Contact Business | `contact` | Contact composer opened | Total contact intent | Contact intent for the business |
| Send first in-app message | `message_enquiry` | A new customer-to-business conversation thread was successfully created | Total new enquiries | Enquiries received by the business |
| Tap Call | `call` | Phone dial action requested | Total call intent | Call intent for the business |
| Tap WhatsApp | `whatsapp` | WhatsApp action requested | Total WhatsApp intent | WhatsApp intent for the business |
| Tap Directions or address | `directions` | Navigation action requested | Total direction intent | Direction intent for the business |
| Tap Share | `share` | Native share sheet requested | Total shares | Shares for the business |
| Tap Website | `website` | Website action requested | Total website visits | Website visits for the business |
| Tap Facebook | `facebook` | Facebook action requested | Total Facebook visits | Facebook visits for the business |
| Tap Instagram | `instagram` | Instagram action requested | Total Instagram visits | Instagram visits for the business |
| Tap X | `x` | X action requested | Total X visits | X visits for the business |
| Tap active Promotion | `promotions` | Promotions tab/action requested | Total promotion interest | Promotion interest for the business |
| Open Services & Products | `services` | Services panel expanded | Total service-detail interest | Service-detail interest for the business |
| Open Opening Hours | `hours` | Hours tab/action requested | Total hours checks | Hours checks for the business |
| Tap Favourite | `favourite` | Favourite control tapped | Total favourite actions | Favourite actions for the business |

## Page modes

| Mode | Filters | Output |
|---|---|---|
| Overall | City, search text, category and subcategory | Aggregated KPI cards, action totals and most-accessed businesses for the filtered set |
| Selected business | Same filters, followed by a filtered business dropdown | KPI cards and action breakdown for one business |

## Data and privacy boundaries

- Statistics store aggregate counters only.
- Message text, sender identity, phone number, email, ABN, referrer data and exact address are not copied into statistics.
- `message_enquiry` counts the first successfully created conversation for a customer and business. Further replies remain in Inbox but do not increase the enquiry count.
- Counters describe interactions, not confirmed sales, calls completed, journeys completed or unique people.
- Only Business Directory admins and super admins can read statistics documents. Clients cannot write counters directly; the trusted Cloud Function validates the action and updates them.
