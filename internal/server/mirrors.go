package server

type mirrorSource struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

func defaultMirrors() []mirrorSource {
	return []mirrorSource{
		{"南京大学", "https://mirror.nju.edu.cn/immortalwrt"},
		{"北京大学", "https://mirrors.pku.edu.cn/immortalwrt"},
		{"浙江大学", "https://mirrors.zju.edu.cn/immortalwrt"},
		{"上海交通大学", "https://mirror.sjtu.edu.cn/immortalwrt"},
		{"中国科学技术大学", "https://mirrors.ustc.edu.cn/immortalwrt"},
		{"CERNET 高校联合镜像", "https://mirrors.cernet.edu.cn/immortalwrt"},
		{"Vsean 镜像", "https://mirrors.vsean.net/openwrt"},
		{"吉林大学", "https://mirrors.jlu.edu.cn/immortalwrt"},
		{"ImmortalWrt 官方", "https://downloads.immortalwrt.org"},
	}
}
