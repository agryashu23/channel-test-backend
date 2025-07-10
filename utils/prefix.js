const CachePrefix = {
  //business
  ANALYTICS_PREFIX: "analytics:", //{businessId}
  BUSINESS_USERS_COUNT_PREFIX: "business:usersCount:", //{businessId} // join-user
  BUSINESS_CHANNELS_COUNT_PREFIX: "business:channelsCount:", //{businessId} // create-channel
  BUSINESS_PREFIX: "embed:business:", //{businessId}
  CHANNEL_BUSINESS_REQUESTS_PREFIX: "channel:business:requests:", // channel status=request// {businessId}
  TOPIC_BUSINESS_REQUESTS_PREFIX: "topic:business:requests:", // topic status=request// {businessId}
  EVENT_BUSINESS_REQUESTS_PREFIX: "event:business:requests:", // event status=request// {businessId}
  BUSINESS_PLAN_PREFIX: "business:plan:", //{businessId} // all-payment-check
  //plan
  PLAN_PREFIX: "plan:", //{planId}
  //channel
  CHANNEL_MEMBERSHIP_USER_PREFIX: "channel:membership:", //{channelId}:{userId} channel membership of user
  CHANNELS_MEMBERS_PREFIX: "channel:members:", //{channelId} channel members
  CHANNEL_REQUESTS_PREFIX: "channel:requests:", //{channelId} channel requests
  CHANNEL_PREFIX: "channel:", //{channelId} channel
  CHANNELS_CREATED_PREFIX: "channels:created:", //{userId} created channels
  CHANNELS_MEMBERS_COUNT_PREFIX: "channels:members:count:", //{channelId} channel members count
  //topic
  TOPICS_MEMBERS_PREFIX: "topics:members:", //{topicId} topic members
  TOPIC_REQUESTS_PREFIX: "topic:requests:", //{topicId} topic requests
  TOPIC_PREFIX: "topic:", //{topicId} topic
  TOPICS_ALL_CHANNEL_PREFIX: "topics:all:channel:", //{channelId} all topics of channel
  TOPICS_CHANNEL_COUNT_PREFIX: "topics:channel:count:", //{channelId} topics count of channel
  TOPIC_MEMBERSHIP_USER_PREFIX: "topic:membership:", //{topicId}:{userId} topic membership of user
  //chats
  CHATS_PINNED_PREFIX: "chats:pinned:", //{topicId} pinned chats
  TOPIC_RESOURCE_PREFIX: "topic:resource:", //{topicId} topic resource
  //events
  EVENT_TOPIC_MEMBERSHIP_USER_PREFIX: "event:membership:", //{topicId}:{userId} events membership of user in topic
  EVENT_MEMBERS_PREFIX: "event:members:", //{eventId} event members
  EVENT_REQUESTS_PREFIX: "event:requests:", //{eventId} event requests
  TOPIC_EVENTS_PREFIX: "topic:events:", //{topicId} topic events
  EVENT_PREFIX: "event:", //{eventId} event
  EVENT_MEMBERSHIP_PREFIX: "event:membership:", //{eventId}:{userId} event membership of user
  //poll
  POLL_PREFIX: "poll:", //{pollId} poll
  POLL_USER_VOTE_PREFIX: "poll:userVote:", //{pollId}:{userId} poll user vote
  TOPIC_POLLS_PREFIX: "topic:polls:", //{topicId} poll topic
  POLL_VOTE_COUNTS_PREFIX: "poll_vote_counts:", //{pollId} poll vote counts

  //chat
  CHAT_TOPIC_PREFIX: "topic_chats:",
};

module.exports = { CachePrefix };
