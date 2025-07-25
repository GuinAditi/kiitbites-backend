const Vendor = require("../models/account/Vendor");
const Uni = require("../models/account/Uni");

// Get all vendors for a specific university
exports.getVendorsByUni = async (req, res) => {
  try {
    const { uniId } = req.params;

    if (!uniId) {
      return res.status(400).json({ error: "Missing 'uniId' in path." });
    }

    const vendors = await Vendor.find({ uniID: uniId })
      .select("_id fullName retailInventory produceInventory")
      .lean();
    res.status(200).json(vendors);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Get all vendors with their availability status for a specific university
exports.getVendorsWithAvailability = async (req, res) => {
  try {
    const { uniId } = req.params;

    if (!uniId) {
      return res.status(400).json({ error: "Missing 'uniId' in path." });
    }

    // Get university with vendors array
    const uni = await Uni.findById(uniId).select("vendors").lean();
    if (!uni) {
      return res.status(404).json({ error: "University not found." });
    }

    // Get all vendors for this university
    const vendors = await Vendor.find({ uniID: uniId })
      .select("_id fullName email phone location deliverySettings")
      .lean();

    // Create a map of vendor availability
    const availabilityMap = new Map();
    uni.vendors.forEach(vendor => {
      availabilityMap.set(vendor.vendorId.toString(), vendor.isAvailable);
    });

    // Combine vendor data with availability status
    const vendorsWithAvailability = vendors.map(vendor => ({
      _id: vendor._id,
      fullName: vendor.fullName,
      email: vendor.email,
      phone: vendor.phone,
      location: vendor.location,
      isAvailable: availabilityMap.get(vendor._id.toString()) || "N",
      deliverySettings: vendor.deliverySettings || {
        offersDelivery: false,
        deliveryPreparationTime: 30
      }
    }));

    res.status(200).json(vendorsWithAvailability);
  } catch (err) {
    console.error("Error in getVendorsWithAvailability:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Update vendor availability in university
exports.updateVendorAvailability = async (req, res) => {
  try {
    const { uniId, vendorId } = req.params;
    const { isAvailable } = req.body;

    if (!uniId || !vendorId) {
      return res.status(400).json({ error: "Missing 'uniId' or 'vendorId' in path." });
    }

    if (!isAvailable || !["Y", "N"].includes(isAvailable)) {
      return res.status(400).json({ error: "Invalid 'isAvailable' value. Must be 'Y' or 'N'." });
    }

    // Update the vendor availability in the university
    const result = await Uni.updateOne(
      { 
        _id: uniId,
        "vendors.vendorId": vendorId 
      },
      { 
        $set: { "vendors.$.isAvailable": isAvailable } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "University or vendor not found." });
    }

    res.status(200).json({ 
      success: true, 
      message: `Vendor availability updated to ${isAvailable === 'Y' ? 'available' : 'unavailable'}` 
    });
  } catch (err) {
    console.error("Error in updateVendorAvailability:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Delete a vendor from a university and the Vendor collection
exports.deleteVendor = async (req, res) => {
  try {
    const { uniId, vendorId } = req.params;
    if (!uniId || !vendorId) {
      return res.status(400).json({ error: "Missing 'uniId' or 'vendorId' in path." });
    }

    // Remove vendor from university's vendors array
    const uniUpdate = await Uni.updateOne(
      { _id: uniId },
      { $pull: { vendors: { vendorId } } }
    );
    if (uniUpdate.modifiedCount === 0) {
      return res.status(404).json({ error: "Vendor not found in university." });
    }

    // Delete the vendor document
    const vendorDelete = await Vendor.deleteOne({ _id: vendorId, uniID: uniId });
    if (vendorDelete.deletedCount === 0) {
      return res.status(404).json({ error: "Vendor document not found." });
    }

    res.status(200).json({ success: true, message: "Vendor deleted successfully." });
  } catch (err) {
    console.error("Error in deleteVendor:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Update isSpecial for a specific item in a vendor's inventory
exports.updateItemSpecialStatus = async (req, res) => {
  try {
    const { vendorId, itemId, kind } = req.params;
    const { isSpecial } = req.body;
    if (!vendorId || !itemId || !kind) {
      return res.status(400).json({ error: "Missing vendorId, itemId, or kind in path." });
    }
    if (!["Y", "N"].includes(isSpecial)) {
      return res.status(400).json({ error: "Invalid isSpecial value. Must be 'Y' or 'N'." });
    }
    const inventoryField = kind === "retail" ? "retailInventory" : "produceInventory";
    const updateResult = await Vendor.updateOne(
      { _id: vendorId, [`${inventoryField}.itemId`]: itemId },
      { $set: { [`${inventoryField}.$.isSpecial`]: isSpecial } }
    );
    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ error: "Vendor or item not found in inventory." });
    }
    res.status(200).json({ success: true, message: `isSpecial updated to ${isSpecial}` });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Update isAvailable for a specific item in a vendor's inventory
exports.updateItemAvailableStatus = async (req, res) => {
  try {
    const { vendorId, itemId, kind } = req.params;
    const { isAvailable } = req.body;
    if (!vendorId || !itemId || !kind) {
      return res.status(400).json({ error: "Missing vendorId, itemId, or kind in path." });
    }
    if (!["Y", "N"].includes(isAvailable)) {
      return res.status(400).json({ error: "Invalid isAvailable value. Must be 'Y' or 'N'." });
    }
    // Allow both 'retail' and 'produce'
    let inventoryField;
    if (kind === "retail") {
      inventoryField = "retailInventory";
    } else if (kind === "produce") {
      inventoryField = "produceInventory";
    } else {
      return res.status(400).json({ error: "Invalid kind. Must be 'retail' or 'produce'." });
    }
    const updateResult = await Vendor.updateOne(
      { _id: vendorId, [`${inventoryField}.itemId`]: itemId },
      { $set: { [`${inventoryField}.$.isAvailable`]: isAvailable } }
    );
    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ error: "Vendor or item not found in inventory." });
    }
    res.status(200).json({ success: true, message: `isAvailable updated to ${isAvailable}` });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

/**
 * GET /vendor/:vendorId/delivery-settings
 * Get delivery settings for a vendor
 */
exports.getDeliverySettings = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    const vendor = await Vendor.findById(vendorId).select('deliverySettings').lean();
    
    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        message: "Vendor not found" 
      });
    }
    
    res.json({
      success: true,
      data: vendor.deliverySettings || {
        offersDelivery: false,
        deliveryPreparationTime: 30
      }
    });
  } catch (err) {
    console.error("Error getting delivery settings:", err);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

/**
 * PUT /vendor/:vendorId/delivery-settings
 * Update delivery settings for a vendor
 */
exports.updateDeliverySettings = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const {
      offersDelivery,
      deliveryPreparationTime
    } = req.body;
    
    // Validate input
    if (typeof offersDelivery !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "offersDelivery must be a boolean"
      });
    }
    
    if (deliveryPreparationTime !== undefined && (deliveryPreparationTime < 0 || deliveryPreparationTime > 180)) {
      return res.status(400).json({
        success: false,
        message: "deliveryPreparationTime must be between 0 and 180 minutes"
      });
    }
    
    // Build update object
    const updateData = {};
    if (offersDelivery !== undefined) updateData['deliverySettings.offersDelivery'] = offersDelivery;
    if (deliveryPreparationTime !== undefined) updateData['deliverySettings.deliveryPreparationTime'] = deliveryPreparationTime;
    
    const vendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('deliverySettings');
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }
    
    res.json({
      success: true,
      data: vendor.deliverySettings,
      message: "Delivery settings updated successfully"
    });
  } catch (err) {
    console.error("Error updating delivery settings:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
