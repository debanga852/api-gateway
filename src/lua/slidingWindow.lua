--[[
  Sliding Window Rate Limiter — atomic Lua script
  Loaded once via SCRIPT LOAD, called via EVALSHA.

  KEYS[1]  = rate limit key  (e.g. rl:ip:1.2.3.4)
  ARGV[1]  = now             (Unix ms as string)
  ARGV[2]  = windowMs        (window size in ms)
  ARGV[3]  = maxRequests     (limit per window)
  ARGV[4]  = requestId       (unique member for ZADD)
  ARGV[5]  = ttlSeconds      (key expiry in seconds)

  Returns: table {allowed, currentCount, retryAfterSeconds}
    allowed = 1 if request is permitted, 0 if rejected
--]]

local key         = KEYS[1]
local now         = tonumber(ARGV[1])
local windowMs    = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local requestId   = ARGV[4]
local ttl         = tonumber(ARGV[5])

local windowStart = now - windowMs

-- Remove entries outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

-- Count requests currently in the window
local count = tonumber(redis.call('ZCARD', key))

if count >= maxRequests then
  -- Determine when the oldest entry expires to give a Retry-After value
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = 1
  if oldest[2] then
    retryAfter = math.max(1, math.ceil((tonumber(oldest[2]) + windowMs - now) / 1000))
  end
  return {0, count, retryAfter}
end

-- Admit the request
redis.call('ZADD', key, now, requestId)
redis.call('EXPIRE', key, ttl)

return {1, count + 1, 0}
