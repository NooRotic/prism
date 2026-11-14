<?php

// Router for RequestBodyTest's throwaway built-in server: answers how many body bytes Request::fromGlobals() read. Not part of the service.

require dirname(__DIR__, 3) . '/src/autoload.php';

echo strlen(\Prism\History\Api\Request::fromGlobals()->body);
