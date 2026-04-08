/**
 * Finished-product inventory adjustments for orders.
 * reduce: subtract qty from matched inventory row (same logic as before).
 * restore: add qty back to a specific inventory doc id (used when un-approving).
 */
import {
  collection,
  getDocs,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/**
 * @param {import("firebase/firestore").Firestore} db
 * @param {{ productBarcode?: string, productName?: string, quantity?: number, unit?: string }} orderLine
 * @returns {{ success: boolean, message?: string, inventoryDocId?: string, qtyReduced?: number }}
 */
export async function reduceInventoryForOrder(db, orderLine) {
  const { productBarcode, productName, quantity } = orderLine;
  if (!productBarcode || !productName || !(Number(quantity) > 0)) {
    return { success: false, message: "Invalid order data for inventory reduction" };
  }

  const searchBarcode = String(productBarcode).toLowerCase().trim();
  const searchName = String(productName).toLowerCase().trim();

  try {
    const snap = await getDocs(collection(db, "inventory"));
    const candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter(
        (inv) =>
          inv.category === "finished product" &&
          ((inv.barcode || "").toLowerCase().trim() === searchBarcode ||
            (inv.name || "").toLowerCase().trim() === searchName)
      );

    if (candidates.length === 0) {
      return {
        success: false,
        message: `No finished product inventory found matching "${productName}" (${productBarcode}). Add inventory first.`,
      };
    }

    const target = candidates.find((inv) => {
      const invQty = Number(inv.quantity);
      return !isNaN(invQty) && invQty >= Number(quantity);
    });

    if (!target) {
      const totalAvail = candidates.reduce((sum, inv) => sum + (Number(inv.quantity) || 0), 0);
      return {
        success: false,
        message: `Insufficient inventory for ${quantity} ${orderLine.unit || ""} of "${productName}". Available: ${totalAvail}`,
      };
    }

    const currentQty = Number(target.quantity) || 0;
    const newQty = currentQty - Number(quantity);
    await updateDoc(doc(db, "inventory", target.id), {
      quantity: newQty,
    });

    return { success: true, inventoryDocId: target.id, qtyReduced: Number(quantity) };
  } catch (err) {
    console.error("Inventory reduction failed:", err);
    return { success: false, message: err.message };
  }
}

/**
 * Add qty back to a specific inventory document (undo reduce).
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} inventoryDocId
 * @param {number} qty
 */
export async function restoreInventoryByDocId(db, inventoryDocId, qty) {
  const q = Number(qty);
  if (!inventoryDocId || !(q > 0)) return { success: false, message: "Invalid restore" };
  try {
    const snap = await getDocs(collection(db, "inventory"));
    const inv = snap.docs.find((d) => d.id === inventoryDocId);
    if (!inv) return { success: false, message: "Inventory row not found for restore" };
    const data = inv.data();
    if (String(data.category || "").trim().replace(/\s+/g, " ").toLowerCase() !== "finished product") {
      return { success: false, message: "Cannot restore: not a finished product row" };
    }
    const currentQty = Number(data.quantity) || 0;
    await updateDoc(doc(db, "inventory", inventoryDocId), {
      quantity: currentQty + q,
    });
    return { success: true };
  } catch (err) {
    console.error("Inventory restore failed:", err);
    return { success: false, message: err.message };
  }
}

/**
 * Build product lines from an order document (multi or single product).
 * @param {object} order
 * @returns {Array<{ productBarcode: string, productName: string, quantity: number, unit?: string }>}
 */
export function getOrderProductLines(order) {
  const lines = [];
  if (Array.isArray(order.products) && order.products.length > 0) {
    for (const p of order.products) {
      const productName = (p.productName || p.name || "").trim();
      const productBarcode = (p.productBarcode || p.barcode || "").trim() || "—";
      const quantity = Number(p.quantity) || 0;
      if (!productName || !(quantity > 0)) continue;
      lines.push({
        productBarcode,
        productName,
        quantity,
        unit: p.unit || "",
      });
    }
    return lines;
  }
  if (order.productName) {
    const quantity = Number(order.quantity) || 0;
    if (quantity > 0) {
      lines.push({
        productBarcode: (order.productBarcode || "—").toString().trim(),
        productName: String(order.productName).trim(),
        quantity,
        unit: order.unit || "",
      });
    }
  }
  return lines;
}
