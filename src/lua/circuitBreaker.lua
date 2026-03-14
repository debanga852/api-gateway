--[[
  Circuit Breaker State Machine — atomic Lua script

  KEYS[1]  = cb:{serviceId}   (Hash key)
  ARGV[1]  = event            ('SUCCESS' or 'FAILURE')
  ARGV[2]  = now              (Unix ms)
  ARGV[3]  = failureThreshold
  ARGV[4]  = successThreshold
  ARGV[5]  = timeout          (ms before OPEN -> HALF_OPEN)

  Returns: new state string ('CLOSED' | 'OPEN' | 'HALF_OPEN')
--]]

local key        = KEYS[1]
local event      = ARGV[1]
local now        = tonumber(ARGV[2])
local failThresh = tonumber(ARGV[3])
local succThresh = tonumber(ARGV[4])
local timeout    = tonumber(ARGV[5])

-- Bootstrap if first request
if redis.call('EXISTS', key) == 0 then
  redis.call('HMSET', key,
    'state',           'CLOSED',
    'failureCount',    0,
    'successCount',    0,
    'lastFailureAt',   '',
    'openedAt',        '',
    'nextAttemptAt',   '',
    'lastStateChange', now
  )
end

local state     = redis.call('HGET', key, 'state')
local failCount = tonumber(redis.call('HGET', key, 'failureCount') or 0)
local succCount = tonumber(redis.call('HGET', key, 'successCount') or 0)
local openedAt  = tonumber(redis.call('HGET', key, 'openedAt') or 0)

-- Lazy OPEN -> HALF_OPEN transition
if state == 'OPEN' and openedAt and openedAt > 0 and (now - openedAt) >= timeout then
  state = 'HALF_OPEN'
  redis.call('HMSET', key,
    'state',           'HALF_OPEN',
    'successCount',    0,
    'lastStateChange', now
  )
end

-- Apply event
if event == 'FAILURE' then
  failCount = failCount + 1
  redis.call('HMSET', key, 'failureCount', failCount, 'lastFailureAt', now)

  if state == 'CLOSED' and failCount >= failThresh then
    local nextAttempt = now + timeout
    redis.call('HMSET', key,
      'state',           'OPEN',
      'openedAt',        now,
      'nextAttemptAt',   nextAttempt,
      'lastStateChange', now
    )
    state = 'OPEN'

  elseif state == 'HALF_OPEN' then
    local nextAttempt = now + timeout
    redis.call('HMSET', key,
      'state',           'OPEN',
      'openedAt',        now,
      'nextAttemptAt',   nextAttempt,
      'lastStateChange', now
    )
    state = 'OPEN'
  end

elseif event == 'SUCCESS' then
  succCount = succCount + 1
  redis.call('HMSET', key, 'successCount', succCount, 'failureCount', 0)

  if state == 'HALF_OPEN' and succCount >= succThresh then
    redis.call('HMSET', key,
      'state',           'CLOSED',
      'openedAt',        '',
      'nextAttemptAt',   '',
      'lastStateChange', now
    )
    state = 'CLOSED'
  end
end

return state
