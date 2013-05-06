angular.module('ngTranslate', ['ng', 'ngCookies'])

.run(['$translate', '$COOKIE_KEY', '$cookieStore', function ($translate, $COOKIE_KEY, $cookieStore) {

  if ($translate.rememberLanguage()) {
    if (!$cookieStore.get($COOKIE_KEY)) {
      $cookieStore.put($COOKIE_KEY, $translate.uses());
    } else {
      $translate.uses($cookieStore.get($COOKIE_KEY));
    }
  }
}]);

angular.module('ngTranslate').constant('$COOKIE_KEY', 'NG_TRANSLATE_LANG_KEY');

angular.module('ngTranslate').provider('$translate', function () {

  var $translationTable = {},
      $uses,
      $rememberLanguage = false,
      $asyncLoaders = [];

  var LoaderGenerator = {

    forUrl : function (url) {
      return ['$http', '$q', function ($http, $q) {
        return function(key) {

         var deferred = $q.defer();

          $http({
            url: url,
            params: {lang: key},
            method : 'GET'
          }).success(function (data, status) {
            deferred.resolve(data);
          }).error(function (data, status) {
            deferred.reject(key);
          });

          return deferred.promise;
        };
      }];
    },

    byStaticFiles : function (prefix, suffix) {
      return ['$http', '$q', function ($http, $q) {
        return function(key) {

          var deferred = $q.defer();

          $http({
            url: [prefix, key, suffix].join(''),
            method : 'GET',
            params: ''
          }).success(function (data, status) {
            deferred.resolve(data);
          }).error(function (data, status) {
            deferred.reject(key);
          });

          return deferred.promise;
        };
      }];
    }
  };

  this.translations = function (langKey, translationTable) {

    if (!langKey && !translationTable) {
      return $translationTable;
    }

    if (langKey && !translationTable) {
      if (angular.isString(langKey)) {
        return $translationTable[langKey];
      } else {
        $translationTable = langKey;
      }
    } else {
      $translationTable[langKey] = translationTable;
    }
  };

  this.uses = function (langKey) {
    if (langKey) {
      if (!$translationTable[langKey] && (!$asyncLoaders.length)) {
        // only throw an error, when not loading translation data asynchronously
        throw new Error("$translateProvider couldn't find translationTable for langKey: '" + langKey + "'");
      }
      $uses = langKey;
    } else {
      return $uses;
    }
  };

  this.rememberLanguage = function (boolVal) {
    if (angular.isUndefined(boolVal)) {
      return $rememberLanguage;
    }
    $rememberLanguage = boolVal;
  };

  this.registerLoader = function (loader) {

    if (!loader) {
      throw new Error("Please define a valid loader!");
    }

    var $loader;

    if (!(angular.isFunction(loader) || angular.isArray(loader))) {
      if (angular.isString(loader)) {
        loader = {
          type : 'url',
          url : loader
        };
      }

      switch (loader.type) {
        case 'url':
          $loader = LoaderGenerator.forUrl(loader.url);
          break;
        case 'static-files':
          $loader = LoaderGenerator.byStaticFiles(loader.prefix, loader.suffix);
          break;
      }
    } else {
      $loader = loader;
    }
    $asyncLoaders.push($loader);
  };

  var invokeLoading = function($injector, key) {

    var deferred = $injector.get('$q').defer(),
        loaderFnBuilder = $asyncLoaders[0],
        loaderFn;

    if (loaderFnBuilder) {
      loaderFn = $injector.invoke(loaderFnBuilder);
      if (angular.isFunction(loaderFn)) {
        loaderFn(key).then(function (data) {
          $translationTable[key] = data;
          deferred.resolve(data);
        }, function (key) {
          deferred.reject(key);
        });
      } else {
        deferred.reject(key);
      }
    } else {
      deferred.reject(key);
    }

    return deferred.promise;
  };

  this.$get = [
    '$interpolate',
    '$log',
    '$injector',
    '$cookieStore',
    '$rootScope',
    '$q',
    '$COOKIE_KEY',
    function ($interpolate, $log, $injector, $cookieStore, $rootScope, $q, $COOKIE_KEY) {

    var $translate = function (translationId, interpolateParams) {
      var translation = ($uses) ?
        ($translationTable[$uses] ? $translationTable[$uses][translationId] : translationId) :
        $translationTable[translationId];
      if (translation) {
        return $interpolate(translation)(interpolateParams);
      }

      $log.warn("Translation for " + translationId + " doesn't exist");
      return translationId;
    };

    $translate.uses = function (key) {

      if (!key) {
        return $uses;
      }

      var deferred = $q.defer();

      if (!$translationTable[key]) {
        invokeLoading($injector, key).then(function (data) {
          $uses = key;

          if ($rememberLanguage) {
            $cookieStore.put($COOKIE_KEY, $uses);
          }
          $rootScope.$broadcast('translationChangeSuccess');
          deferred.resolve($uses);
        }, function (key) {
          $rootScope.$broadcast('translationChangeError');
          deferred.reject(key);
        });
        return deferred.promise;
      }

      $uses = key;

      if ($rememberLanguage) {
        $cookieStore.put($COOKIE_KEY, $uses);
      }

      deferred.resolve($uses);
      $rootScope.$broadcast('translationChangeSuccess');
      return deferred.promise;
    };

    $translate.rememberLanguage = function () {
      return $rememberLanguage;
    };

    if ($asyncLoaders.length && angular.equals($translationTable, {})) {
      $translate.uses($translate.uses());
    }

    return $translate;
  }];
});
