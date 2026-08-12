(function () {
    //云平台地址请求
    var API_HOST = "http://api.nlecloud.com";
    var AccessToken = '';

    function jsonp(url, fn, token, data, type)
    {
        url += (url.indexOf('?') > 0 ? '&' : '?') + 't=' + (new Date()).getTime();
        if (token != null && token != undefined)
        {
            if (token == "")
            {
                console.log("请求" + url, { "Status": 1, "Msg": "AccessToken为空！" });
                return;
            }
            else
                url += "&accesstoken=" + token;
        }
        url += "&jsoncallback=?";

        data = data || {};

        if (!type) type = "GET";

        $.ajax({
            url: url,
            type: type,
            data: data,
            //crossDomain: true,
            dataType: "json",
            success: function (result) {
                fn(result);
            },
            error: function (data) {
                console.log(data);
            }
        });
    }

    //构造函数
    function NLECloudAPI() {}

    NLECloudAPI.prototype = {
        /*
        * 用户登录（同时返回AccessToken）
        * @param account 用户
        * @param password 密码
        * @param isRememberMe 记住密码
        */
        userLogin: function (account, password, isRememberMe) {
            var completedCallback;
            jsonp(
                API_HOST + '/Jsonp/Login',
                function (res) {
                    if (res.Status === 0)
                        AccessToken = res.ResultObj.AccessToken;
                    completedCallback && completedCallback(res);
                }, null,
                {
                    Account: account,
                    Password: password,
                    IsRememberMe: (isRememberMe ? true : false)
                },"POST");
                return {
                    completed: function (fn) {
                        completedCallback = fn;
                }
            }
        },
    
        /*
        * 批量查询设备的在线状态
        * @param devIds 设备ID用逗号隔开, 限制100个设备
        */
        getDevicesStatus: function (devIds) {
            var completedCallback;
            if (!devIds) devIds = "";
            var url = API_HOST + "/Devices/Status?devIds=" + devIds;
            jsonp(url, function (res) {
                completedCallback && completedCallback(res);
            }, AccessToken);
            return {
                completed: function (fn) {
                    completedCallback = fn;
                }
            }
        },
        /*
        * 查询传感数据
        * @param query 查询条件
        */
        getSensorData: function (query) {
            var completedCallback;
            if (!query) throw "query 不能为空";
            if (!query.DeviceId) throw "DeviceId 不能为空";
            var queryStr = "";
            queryStr += (query.DeviceId ? ("DeviceId=" + query.DeviceId + "&") : "");
            queryStr += (query.ApiTags ? ("ApiTags=" + query.ApiTags + "&") : "");
            queryStr += (query.Method ? ("Method=" + query.Method + "&") : "");
            queryStr += (query.TimeAgo ? ("TimeAgo=" + query.TimeAgo + "&") : "");
            queryStr += (query.Sort ? ("Sort=" + query.Sort + "&") : "");

            queryStr += (query.StartDate ? ("StartDate=" + encodeURIComponent(query.StartDate) + "&") : "");
            queryStr += (query.EndDate ? ("EndDate=" + encodeURIComponent(query.EndDate) + "&") : "");
            queryStr += (query.PageSize ? ("PageSize=" + query.PageSize + "&") : "PageSize=20&");
            queryStr += (query.PageIndex ? ("PageIndex=" + query.PageIndex + "&") : "PageIndex=1&");
            var url = API_HOST + "/devices/" + query.DeviceId + "/Datas?" + queryStr;
            jsonp(url, function (res) {
                completedCallback && completedCallback(res);
            }, AccessToken);
            return {
                completed: function (fn) {
                    completedCallback = fn;
                }
            }
        },


        /*
        *发送命令/控制设备
        * @param deviceId 设备ID
        * @param apiTag 传感标识名（可选）
        * @param data 开关类：开=1，关=0，暂停=2
                      家居类：调光灯亮度=0~254，RGB灯色度=2~239，窗帘、卷闸门、幕布打开百分比=3%~100%，红外指令=1(on)2(off)
                      其它：integer/float/Json/String类型值
        */
        Cmds: function (deviceId, apiTag, data) {
            var completedCallback;
            var url = API_HOST + "/jsonp?func=Cmds&deviceId=" + deviceId + "&apiTag=" + apiTag;
            jsonp(url, function (res) {
                completedCallback && completedCallback(res);
            }, AccessToken, { data: data }, "POST");
            return {
                completed: function (fn) {
                    completedCallback = fn;
                }
            }
        }

    };

    window.NLECloudAPI = NLECloudAPI;

})();


String.prototype.format = function (args) {
    var result = this;
    var reg;
    if (arguments.length > 0) {
        if (arguments.length === 1 && typeof (args) === "object") {
            for (var key in args) {
                if (args.hasOwnProperty(key) && args[key] !== undefined) {
                    reg = new RegExp("({)" + key + "(})", "g");
                    result = result.replace(reg, args[key]);
                }
            }
        }
        else {
            for (var i = 0; i < arguments.length; i++) {
                if (arguments[i] !== undefined) {
                    reg = new RegExp("({)" + i + "(})", "g");
                    result = result.replace(reg, arguments[i]);
                }
            }
        }
    }
    return result;
};