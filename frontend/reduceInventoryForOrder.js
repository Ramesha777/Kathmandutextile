/**
 * Reduce inventory for approved order. Matches by productBarcode → inventory name.
 * Finds first finished product inventory item matching barcode & reduces qty.
 * @param {Object} order - Order data with productBarcode, productName, quantity, unit
 * @returns {{ success: boolean, message?: string }}
 */
async function reduceInventoryForOrder(order) {
  const { productBarcode, productName, quantity } = order;
  if (!productBarcode || !productName || !(Number(quantity) > 0)) {
    return { success: false, message: 'Invalid order data for inventory reduction' };
  }

  const searchBarcode = String(productBarcode).toLowerCase().trim();
  const searchName = String(productName).toLowerCase().trim();

  try {
    // Query inventory for finished products matching barcode OR name
    const snap = await getDocs(collection(db, 'inventory'));
    const candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((inv) => inv.category === 'finished product' &&
        ((inv.barcode || '').toLowerCase().trim() === searchBarcode ||
         (inv.name || '').toLowerCase().trim() === searchName));

    if (candidates.length === 0) {
      return { 
        success: false, 
        message: `No finished product inventory found matching "${productName}" (${productBarcode}). Add inventory first.` 
      };
    }

    // Find first with sufficient quantity
    const target = candidates.find((inv) => {
      const invQty = Number(inv.quantity);
      return !isNaN(invQty) && invQty >= Number(quantity);
    });

    if (!target) {
      const totalAvail = candidates.reduce((sum, inv) => sum + (Number(inv.quantity) || 0), 0);
      return { 
        success: false, 
        message: `Insufficient inventory for ${quantity} ${order.unit || ''} of "${productName}". Available: ${totalAvail}` 
      };
    }

    // Update inventory
    const currentQty = Number(target.quantity) || 0;
    const newQty = currentQty - Number(quantity);
    await updateDoc(doc(db, 'inventory', target.id), {
      quantity: newQty
    });

    console.log(`Reduced inventory: ${productName} ${quantity} → new qty ${newQty}`);
    return { success: true };
  } catch (err) {
    console.error('Inventory reduction failed:', err);
    return { success: false, message: err.message };
  }
}
