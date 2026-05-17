import UserActivity from "../model/userActivity.js";

// API: Get All Activities for Admin Dashboard
export const getUserActivities = async (req, res) => {
  try {
    // Fetch last 50 activities, sorted by newest first
    const activities = await UserActivity.find()
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      activities
    });
  } catch (error) {
    console.error("Fetch Activity Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// HELPER: Call this function in your other controllers to save a log
// Example: await logActivity("Admin", "Added a new product", "Admin", "success");
export const logActivity = async (user, action, role = 'User', type = 'info') => {
    try {
        await UserActivity.create({ user, action, role, type });
    } catch (error) {
        console.error("Failed to log activity:", error);
    }
};