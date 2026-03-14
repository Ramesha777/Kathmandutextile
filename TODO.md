## Manage Orders Button Improvement Plan

**Current**: Orders table (`Manager.html` → `manager.js` `loadManagerOrders()`):
```
<td><div style="display:flex;gap:6px;">
  <button class="btn btn-sm btn-order-status" data-status="pending">Pending</button>
  <button class="btn btn-sm btn-order-status" data-status="approved">Approved</button>
  <button class="btn btn-sm btn-order-status" data-status="completed">Completed</button>
  <button class="btn btn-sm btn-danger btn-order-delete">Delete</button>
</div></td>
```
`.btn-sm { padding: 0.4rem 0.85rem; font-size: 0.8rem; }`

**Goal**: Single "Actions" button → toggle show smaller buttons.

**Files**:
| File | Change |
|------|--------|
| `frontend/manager.js` | `loadManagerOrders()`: Replace div with `<button class="btn-actions-toggle">Actions ▼</button><div class="order-actions hidden">4 small buttons</div>`
| `frontend/manager.css` | `.btn-xs { padding: 0.25rem 0.6rem; font-size: 0.7rem; } .order-actions { display:flex;gap:4px; } .btn-actions-toggle:hover .hidden { display:flex; }`
| Event listeners | Toggle `.hidden` class on click.

**Step-by-step**:
1. ✅ Create TODO
2. Edit `manager.js` `loadManagerOrders()` HTML generation
3. Edit `manager.css` new styles + `.btn-xs`
4. Update JS toggle listener from `.order-manage-toggle` → `.btn-actions-toggle`
5. Test → complete

**Completed** ✅: Added toggle Actions button + `.btn-xs` styles + event delegation in `manager.js`/`manager.css`.

**Test**: Navigate to Orders → click "Actions ▼" → verify dropdown toggle + small buttons work.

**Production filters task**: Complete! 🎉 (filters now functional).

Open `frontend/production.html` to test filters, or `Manager.html` → Performance → Production Log.


