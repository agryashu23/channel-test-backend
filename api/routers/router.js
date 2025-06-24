const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  authLimiter,
  otpLimiter,
  usernameLimiter,
  whatsappLimiter,
} = require("../../middlewares/rateLimiters");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    fieldSize: 10 * 1024 * 1024,
  },
});
const multipleUploadChannel = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "cover_image", maxCount: 1 },
]);

const multipleUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "files", maxCount: 5 },
]);

const multipleUploadChip = upload.fields([
  { name: "document", maxCount: 1 },
  { name: "files", maxCount: 5 },
]);
const multipleUploadChat = upload.fields([{ name: "files", maxCount: 10 }]);

//Controllers
const UserController = require("../controllers/UserController");
const CurationController = require("../controllers/CurationController");
const ChipController = require("../controllers/ChipController");
const ProfileController = require("../controllers/ProfileController");
const AdminController = require("../controllers/AdminController");
const NewsletterController = require("../controllers/NewsletterController");
const CommentController = require("../controllers/CommentController");
const MetaController = require("../controllers/MetaController");
const SegmentController = require("../controllers/SegmentController");
const WaitlistController = require("../controllers/WaitlistController");
const ChatController = require("../controllers/ChatController");
const UtilsController = require("../controllers/UtilsController");
const TopicController = require("../controllers/TopicController");
const ChannelController = require("../controllers/ChannelController");
const FaqsController = require("../controllers/FaqsController");
const InviteController = require("../controllers/InviteController");
const QueryController = require("../controllers/QueryController");
const EventController = require("../controllers/EventController");
const EmbedController = require("../controllers/EmbedController");
const SummaryController = require("../controllers/SummaryController");
const DMController = require("../controllers/DMController");
const AnalyticsController = require("../controllers/AnalyticsController");
const PlanController = require("../controllers/PlanController");
const HealthController = require("../controllers/HealthController");
const PaymentController = require("../controllers/PaymentController");
const TransactionController = require("../controllers/TransactionController");
const BusinessController = require("../controllers/BusinessController");

// Middlewares
const VerifyUser = require("../../middlewares/VerifyToken");
const CsrfVerify = require("../../middlewares/VerifyCsrf");

router.post("/join-waitlist", WaitlistController.join_waitlist);

router.post("/google/auth", UserController.google_auth);
router.post("/login", UserController.login);
router.post("/register", authLimiter, UserController.register);
router.post("/verify/auth", UserController.verify_auth);
router.post("/forgot/password", UserController.forgotPassword);
router.post("/reset/password", UserController.resetPassword);
router.post(
  "/claim/username",
  
  VerifyUser,
  UserController.claimUserName
);
router.post("/check/username", usernameLimiter, UserController.check_username);
router.post(
  "/update/whatsapp/number",
  whatsappLimiter,
  VerifyUser,
  UserController.update_whatsapp_number
);
router.post(
  "/save/whatsapp/number",
  whatsappLimiter,
  VerifyUser,
  UserController.save_whatsapp_number
);
router.post(
  "/check/username/profile",
  VerifyUser,
  usernameLimiter,
  UserController.check_username_profile
);
router.post("/username/exist", UserController.username_exist);
// router.post("/get-password", UserController.get_password);
router.post(
  "/update/links",
  
  VerifyUser,
  UserController.updateLinks
);
router.post(
  "/update/details/profile",
  VerifyUser,
  upload.single("file"),
  
  UserController.updateDetailsProfile
);
router.post(
  "/update/profile",
  VerifyUser,
  multipleUpload,
  
  UserController.updateProfile
);
router.post("/fetch/userData", VerifyUser, UserController.fetch_user);
router.post("/fetch/user/details", UserController.fetch_user_details);

//Event
router.post("/join/event", VerifyUser,  EventController.join_event);

router.post(
  "/create/chat/event",
  VerifyUser,
  upload.single("file"),
  EventController.create_chat_event
);
router.post("/create/chat/poll", VerifyUser, EventController.create_poll);
router.post("/fetch/event/data", EventController.fetch_event_data);
router.post(
  "/create/private/poll/response",
  VerifyUser,
  EventController.make_private_poll_response
);
router.post(
  "/create/public/poll/response",
  EventController.make_public_poll_response
);

router.post(
  "/edit/chat/event",
  VerifyUser,
  
  upload.single("file"),
  EventController.edit_chat_event
);

router.post(
  "/delete/chat/event",
  VerifyUser,
  
  EventController.delete_chat_event
);

//channel
router.post(
  "/check/channel/name",
  VerifyUser,
  
  ChannelController.check_channel_name
);
// router.post(
//   "/check/channel/edit/name",
//   VerifyUser,
//   ChannelController.check_channel_edit_name
// );

router.post(
  "/create/channel",
  VerifyUser,
  multipleUploadChannel,
  ChannelController.create_channel
);
router.post("/delete/channel", VerifyUser, ChannelController.delete_channel);
router.post(
  "/update/channel",
  VerifyUser,
  
  multipleUploadChannel,
  ChannelController.update_channel
);
router.post(
  "/remove/channel/cover",
  VerifyUser,
  
  ChannelController.removeChannelCover
);
router.post(
  "/save/channel/cover",
  VerifyUser,
  
  upload.single("file"),
  ChannelController.saveChannelCover
);
router.post(
  "/fetch/my/channels",
  VerifyUser,
  ChannelController.fetch_my_channels
);
router.post("/fetch/channels", ChannelController.fetch_channels);
router.post("/fetch/channel", ChannelController.fetch_channel);
// router.post("/fetch/user/channels", ChannelController.fetch_user_channels);
router.post(
  "/fetch/community/channel",
  ChannelController.fetch_community_channel
);
router.post(
  "/fetch/channel/members",
  VerifyUser,
  ChannelController.fetch_channel_members
);
router.get("/accept/channel/request", VerifyUser,ChannelController.accept_channel_request);

router.get("/decline/channel/request", VerifyUser,ChannelController.decline_channel_request);
router.post("/join/channel", VerifyUser, ChannelController.join_channel);
router.post("/leave/channel", VerifyUser, ChannelController.leave_channel);
router.post(
  "/remove/channel/member",
  VerifyUser,
  
  ChannelController.remove_channel_member
);
router.post(
  "/create/general/topic",
  VerifyUser,
  TopicController.createGeneralTopic
);
router.post("/delete/topic", VerifyUser, TopicController.delete_topic);

//topics

router.post(
  "/update/topic",
  VerifyUser,
  TopicController.update_topic
);
  router.post(
    "/join/topic",
    VerifyUser,
    TopicController.join_topic
  );
  router.post(
    "/leave/topic",
    VerifyUser,
    TopicController.leave_topic
  );
// router.post(
//   "/fetch/topic/subscription",
//   TopicController.fetch_topic_subscription
// );
// router.post("/visit/topic", VerifyUser, TopicController.visit_topic);
router.post("/mark/as/read", VerifyUser, TopicController.mark_as_read);
router.post(
  "/create/topic",
  VerifyUser,
  TopicController.create_topic
);
router.post("/fetch/topic", TopicController.fetch_topic);
 router.post(
   "/fetch/my/channel/topics",
   VerifyUser,
   TopicController.fetch_my_channel_joined_topics
 );
router.post(
  "/fetch/channel/topics",
  VerifyUser,
  TopicController.fetch_all_channel_topics
);

router.post(
  "/update/channel/topics/order",
  VerifyUser,
  TopicController.update_channel_topics_order
);

//faqs
router.post("/create/faq", VerifyUser,  FaqsController.create_faq);
router.post("/fetch/user/faqs", FaqsController.fetch_faqs);
router.post(
  "/update/faqs/order",
  VerifyUser,
  FaqsController.update_faqs_order
);
router.post("/delete/faq", VerifyUser,  FaqsController.delete_faq);
router.post("/update/faq", VerifyUser,  FaqsController.update_faq);

//utils
router.post("/channel/unsplash/search", UtilsController.channel_unsplash);
router.post("/whatsapp/test", UtilsController.whatsapp_test);
router.post("/places/autocomplete", UtilsController.places_autocomplete);
router.post("/send-whatsapp", UtilsController.send_whatsapp);
router.get("/getAddress", UtilsController.getAddress);

//chats
router.post(
  "/create/channel/chat",
  VerifyUser,
  multipleUploadChat,
  ChatController.create_chat
);

router.post("/fetch/topic/chats",VerifyUser, ChatController.fetch_topic_chats);
router.post("/fetch/resource/chats",VerifyUser, ChatController.fetch_resource_chats);
router.post("/fetch/topic/events", VerifyUser, EventController.fetch_topic_events);
router.post("/fetch/topic/event/members",VerifyUser, EventController.fetch_event_memberships);
router.post("/fetch/event/members",VerifyUser, EventController.fetch_all_event_members);




router.post(
  "/delete/topic/chat",
  VerifyUser,
  ChatController.delete_topic_chat
);
router.post(
  "/push/to/resource",
  VerifyUser,
  ChatController.push_to_resource
);
router.post(
  "/remove/from/resource",
  VerifyUser,
  ChatController.remove_from_resource
);

router.post(
  "/toggle/reaction",
  VerifyUser,
  ChatController.toggle_reaction
);


//invites
router.post(
  "/create/channel/invite",
  VerifyUser,
  InviteController.create_channel_invite
);
router.post(
  "/create/topic/invite",
  VerifyUser,
  InviteController.create_topic_invite
);
router.post(
  "/join/channel/invite",
  VerifyUser,
  ChannelController.join_channel_invite
);
router.post(
  "/join/topic/invite",
  VerifyUser,
  TopicController.join_topic_invite
);

router.post(
  "/create/curation",
  VerifyUser,
  
  upload.single("file"),
  CurationController.create_curation
);
router.post(
  "/edit/curation",
  VerifyUser,
  upload.single("file"),
  CurationController.edit_curation
);
router.post(
  "/check/curation/name",
  VerifyUser,
  CurationController.check_curation_name
);
router.post(
  "/delete/curation",
  VerifyUser,
  
  CurationController.delete_curation
);
// router.post("/fetch/curations", CurationController.fetch_all_curations);
router.post(
  "/fetch/my/curations",
  VerifyUser,
  CurationController.fetch_my_curations
);
router.post(
  "/fetch/curation/from/curationId",
  CurationController.fetch_curation_from_curationId
);
router.post(
  "/fetch/category/curations",
  CurationController.fetch_category_curations
);
router.post(
  "/toggle/save/curation",
  VerifyUser,
  
  CurationController.toggle_save_curation
);
router.post("/fetch/saved/curations", CurationController.fetch_saved_curations);
// router.post("/existing/curations", CurationController.existing_curations);
router.post(
  "/set/curation/searched",
  
  CurationController.setCurationSearched
);
router.post(
  "/set/curation/engagement",
  
  CurationController.setCurationEngagement
);
router.post("/curation/sharedby", CurationController.curation_shared_by);

router.post("/fetch/query", QueryController.fetch_query);
router.post("/post/query", multipleUploadChat, QueryController.post_query);
router.post("/delete/query", QueryController.delete_query);

// router.post('/curations/update/saved',CurationController.curations_update_saved);
// router.post('/curations/chips/count',CurationController.curations_chips_count);
// router.post('/update/images/title',CurationController.update_images_title);

router.post(
  "/create/chip",
  VerifyUser,
  
  multipleUploadChip,
  ChipController.create_chip
);
router.post(
  "/edit/chip",
  VerifyUser,
  
  multipleUploadChip,
  ChipController.edit_chip
);
router.post("/fetch/saved/chips", ChipController.fetch_saved_chips);
// router.post("/fetch/chips", ChipController.fetch_all_chips);
// router.post(
//   "/fetch/all/chips/of/curation",
//   ChipController.fetch_all_chips_of_curation
// );
// router.post(
//   "/fetch/my/chips/of/curation",
//   VerifyUser,
//   ChipController.fetch_my_chips_of_curation
// );
router.post("/fetch/chips/of/curation", ChipController.fetch_chips_of_curation);
router.post("/fetch/chip/from/chipId", ChipController.fetch_chip_from_chipId);
router.post(
  "/add/curation/to/chip",
  VerifyUser,
  
  ChipController.add_curation_to_chip
);
router.post("/upvote/chip", VerifyUser,  ChipController.upvote_chip);
router.post("/chip/shared/by", ChipController.chip_shared_by);
router.post("/metadata", ChipController.metadata);
router.post(
  "/save/chip",
  VerifyUser,
  
  ChipController.toggle_save_chip
);
router.post("/delete/chip", VerifyUser,  ChipController.delete_chip);
router.post(
  "/set/chip/engagement",
  
  ChipController.setChipEngagement
);
router.post(
  "/push/chip/to/curation",
  VerifyUser,
  
  ChipController.update_chip_curation
);
router.post("/chip/sharedby", ChipController.chip_shared_by);
router.post(
  "/delete/field/from/chip",
  
  ChipController.deleteFieldFromChip
);
router.post(
  "/save/excluive/chip/data",
  VerifyUser,
  
  ChipController.save_exclusive_chip_data
);
router.post("/get/excluive/chip/data", ChipController.get_exclusive_chip_data);

router.post(
  "/get/curation/from/username",
  ProfileController.get_curation_from_username
);
router.post(
  "/edit/profile",
  VerifyUser,
  
  ProfileController.edit_profile
);

router.post(
  "/profile/chips/curations",
  ProfileController.profile_chips_curations
);
router.post(
  "/limited/profile/chips/curations",
  ProfileController.limited_profile_chips_curations
);
router.post(
  "/gallery/chips/curations",
  ProfileController.gallery_chips_curations
);
router.post(
  "/fetch/gallery/username",
  ProfileController.fetch_gallery_username
);

router.post(
  "/set/profile/engagement",
  
  ProfileController.setProfileEngagement
);

// router.post(
//   "/post/editors/curations",
//   
//   AdminController.post_curation_picks
// );
// router.post(
//   "/post/banner/cards",
//   VerifyUser,
//   
//   AdminController.post_banner_cards
// );
// router.post("/get/editors/curations", AdminController.get_curation_picks);
router.post("/get/admin/emails", AdminController.get_admin_emails);
router.post(
  "/get/admin/requests",
  VerifyUser,
  AdminController.get_admin_requests
);
router.post(
  "/update/admin/requests",
  VerifyUser,
  AdminController.update_admin_requests
);
router.post(
  "/change/email/access",
  
  AdminController.change_email_access
);

router.post(
  "/create/chip/comment",
  VerifyUser,
  
  CommentController.create_chip_comment
);
router.post(
  "/create/chip/comment/reply",
  VerifyUser,
  
  CommentController.create_chip_comment_reply
);
router.post("/fetch/chip/comments", CommentController.fetch_chip_comments);
router.post(
  "/toggle/comment/upvote",
  VerifyUser,
  
  CommentController.toggle_comment_upvote
);
router.post(
  "/toggle/comment/reply/upvote",
  VerifyUser,
  
  CommentController.toggle_comment_reply_upvote
);

//metadata controllers

router.get("/profile/:username", MetaController.profile_username);
router.get("/curation/:curId", MetaController.get_curation);
router.get("/channel/:channelId", MetaController.get_channel);

//Newsletter

router.post(
  "/test/newsletter",
  VerifyUser,
  upload.single("file"),
  NewsletterController.test_newsletter
);
router.post(
  "/send/newsletter",
  VerifyUser,
  upload.single("file"),
  NewsletterController.send_newsletter
);
router.post(
  "/get/test/newsletter/limit",
  VerifyUser,
  NewsletterController.get_test_newsletter_limit
);
router.post(
  "/get/newsletter/limit",
  VerifyUser,
  NewsletterController.get_newsletter_limit
);

//segmentController
router.post(
  "/create/profile/category",
  VerifyUser,
  
  SegmentController.create_profile_category
);
router.post(
  "/update/profile/category",
  VerifyUser,
  
  SegmentController.update_profile_category
);
router.post(
  "/delete/profile/category",
  VerifyUser,
  
  SegmentController.delete_profile_category
);
router.post(
  "/profile/category/chips/curations",
  SegmentController.profile_categories_chips_curations
);
router.post(
  "/gallery/category/chips/curations",
  SegmentController.gallery_categories_chips_curations
);
router.post(
  "/fetch/profile/categories",
  VerifyUser,
  SegmentController.fetch_profile_categories
);
router.post(
  "/push/item/to/category",
  VerifyUser,
  
  SegmentController.update_item_category
);
router.post(
  "/update/profile/categories/order",
  VerifyUser,
  
  SegmentController.update_profile_categories_order
);
router.post(
  "/update/items/order/category",
  VerifyUser,
  
  SegmentController.update_items_order_category
);

// router.post(
//   "/update/channel/members/abc",
//   
//   SegmentController.update_channel_members
// );

router.get(
  "/download/verification-file",
  EmbedController.download_verification_file
);
router.post("/verify/api/key", EmbedController.verify_api_key);
router.post(
  "/generate/embed-data",
  upload.none(),
  EmbedController.generate_embed_data
);
router.post("/check/auto/login", EmbedController.auto_login);
router.post("/embed/google/auth", EmbedController.embed_google_auth);
router.post("/login/embed", EmbedController.login_embed);
router.post("/verify/login/embed", EmbedController.verify_login_embed);
router.post(
  "/check/domain/verification",
  VerifyUser,
  EmbedController.check_domain_verification
);
router.post(
  "/domain/verification/method",
  VerifyUser,
  EmbedController.domain_verification_method
);
router.post(
  "/check/initial/api/key",
  VerifyUser,
  EmbedController.check_initial_api_key
);
router.post(
  "/check/api/key/generated",
  VerifyUser,
  EmbedController.check_api_key_generated
);
router.post(
  "/fetch/business/credentials",
  BusinessController.fetch_business_credentials
);
router.post(
  "/request/login/auto",
  VerifyUser,
  BusinessController.request_login_auto
);
router.post(
  "/fetch/channel/requests",
  VerifyUser,
  BusinessController.fetch_channel_requests
);
router.post(
  "/fetch/all/channel/requests",
  VerifyUser,
  BusinessController.fetch_all_channel_requests
);
router.post("/save/admin/api", VerifyUser, BusinessController.save_admin_api);
router.post(
  "/save/admin/upload",
  VerifyUser,
  upload.single("file"),
  BusinessController.save_admin_upload
);

//
router.post(
  "/generate/summary/data",
  VerifyUser,
  SummaryController.generate_summary_data
);
router.post(
  "/fetch/topic/summary",
  VerifyUser,
  SummaryController.fetch_topic_summary
);

//
router.post(
  "/fetch/inbox/messages",
  VerifyUser,
  DMController.get_inbox_messages
);
router.post(
  "/create/brand/chat",
  VerifyUser,
  multipleUploadChat,
  DMController.create_brand_chat
);
router.post("/fetch/dm/chats", VerifyUser, DMController.fetch_dm_chats);
router.post("/fetch/brand/chats", VerifyUser, DMController.fetch_brand_chats);

router.post(
  "/create/dm/chat",
  VerifyUser,
  multipleUploadChat,
  DMController.create_dm_chat
);
router.post("/toggle/dm/reaction", VerifyUser, DMController.toggle_dm_reaction);
router.post("/delete/dm/chat", VerifyUser, DMController.delete_dm_chat);
router.post("/mark/dm/last/seen", VerifyUser, DMController.mark_dm_last_seen);

//Analytics
router.post(
  "/fetch/most/active/topics",
  VerifyUser,
  AnalyticsController.fetch_most_active_topics
);
router.post(
  "/fetch/least/active/topics",
  VerifyUser,
  AnalyticsController.fetch_least_active_topics
);
router.post(
  "/fetch/total/users",
  VerifyUser,
  AnalyticsController.fetch_total_users
);
router.post(
  "/fetch/total/chats",
  VerifyUser,
  AnalyticsController.fetch_total_chats
);
router.post(
  "/fetch/active/users",
  VerifyUser,
  AnalyticsController.fetch_active_users
);
router.post(
  "/fetch/most/active/users",
  VerifyUser,
  AnalyticsController.fetch_most_active_users
);
router.post(
  "/fetch/new/joins/chart",
  VerifyUser,
  AnalyticsController.fetch_new_joins_chart
);
router.post(
  "/fetch/user/interaction/chart",
  VerifyUser,
  AnalyticsController.fetch_user_interaction_chart
);
router.post(
  "/fetch/unseen/invites",
  VerifyUser,
  AnalyticsController.fetch_unseen_invites
);

//plans
router.post("/create/plan", PlanController.create_plan);
router.post("/get/plans", PlanController.get_plans);

//Health
router.get("/region/health", HealthController.check);
router.get("/services/health", HealthController.health_check);

//payment
router.post("/create-order", TransactionController.create_order_subscription);
router.post("/verify-payment", PaymentController.verify_payment_subscription);

module.exports = router;
